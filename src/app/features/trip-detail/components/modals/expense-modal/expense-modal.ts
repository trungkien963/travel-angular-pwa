import { Component, Input, Output, EventEmitter, inject, signal, computed, OnInit, NgZone, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { ConfirmService } from '../../../../../core/services/confirm.service';
import { CalculatorInputComponent } from '../../../../../shared/components/calculator-input/calculator-input.component';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { CATEGORY_META } from '../../../trip-detail.component';
import { Expense, Member } from '../../../../../core/models/expense.model';
import { Trip } from '../../../../../core/models/trip.model';

@Component({
  selector: 'app-expense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, CalculatorInputComponent, SwipeToCloseDirective],
  templateUrl: './expense-modal.html',
  styleUrl: './expense-modal.scss',
})
export class ExpenseModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) trip!: Trip;
  @Input() editingExpense: Expense | null = null;
  @Input({ required: true }) currentUserId!: string;
  @Output() onClose = new EventEmitter<void>();

  private translationService = inject(TranslationService);
  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private ngZone = inject(NgZone);

  readonly isSavingExpense = signal(false);
  readonly pendingReceipts = signal<{url: string, file?: File}[]>([]);
  
  expForm = { desc: '', amount: 0, category: 'OTHER', payerId: '', date: '' };
  
  readonly includedMembers = signal<Record<string, boolean>>({});
  readonly activeMemberCount = computed(() => {
    this._refresh();
    return Object.values(this.includedMembers()).filter(v => v).length;
  });
  readonly lockedShares = signal<Record<string, number | null>>({});
  
  readonly pendingNewMembers = signal<any[]>([]);
  readonly orderedMemberIds = signal<string[] | null>(null);

  showPayerList = false;
  newMemberEmail = '';
  readonly isInviting = signal(false);

  readonly categories = Object.entries(CATEGORY_META).map(([id, v]: [string, any]) => ({
    id, emoji: v.emoji, label: v.label
  }));

  // Lightbox
  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);
  readonly lightboxContext = signal<'PENDING' | 'SAVED' | null>(null);

  private _refresh = signal(0);

  ngOnChanges(changes: SimpleChanges) {
    this._refresh.update(v => v + 1);
  }

  ngOnInit() {
    if (this.editingExpense) {
      const exp = this.editingExpense;
      this.expForm = { desc: exp.desc, amount: exp.amount, category: exp.category || 'FOOD', payerId: exp.payerId, date: exp.date };
      const inc: Record<string, boolean> = {};
      const lock: Record<string, number | null> = {};
      const trip = this.trip;
      
      if (trip) {
        if (exp.splits && Object.keys(exp.splits).filter(k => !k.startsWith('__')).length > 0) {
          const splitKeys = Object.keys(exp.splits).filter(k => !k.startsWith('__') && exp.splits![k] > 0);
          
          let isEqualSplit = false;
          if (splitKeys.length > 0) {
            const firstAmount = exp.splits[splitKeys[0]];
            const allSame = splitKeys.every(k => Math.abs(exp.splits![k] - firstAmount) <= 1);
            const totalSplit = splitKeys.reduce((sum, k) => sum + exp.splits![k], 0);
            isEqualSplit = allSame && Math.abs(totalSplit - exp.amount) <= splitKeys.length;
          }

          const fixedIds = (exp.splits as any)['__fixed'] as string[] | undefined;

          trip.members.forEach((m: Member) => {
            const share = exp.splits![m.id];
            if (share !== undefined && share > 0) {
              inc[m.id] = true;
              if (fixedIds) {
                 if (fixedIds.includes(m.id)) {
                   lock[m.id] = share;
                 }
              } else {
                 if (!isEqualSplit) {
                   lock[m.id] = share;
                 }
              }
            } else {
              inc[m.id] = false;
            }
          });
        } else {
          trip.members.forEach((m: Member) => inc[m.id] = true);
        }
      }
      
      if (trip && exp.splits) {
        const splits = exp.splits;
        const sorted = [...trip.members].sort((a: Member, b: Member) => {
          const aInc = (splits[a.id] !== undefined && splits[a.id] > 0) ? 1 : 0;
          const bInc = (splits[b.id] !== undefined && splits[b.id] > 0) ? 1 : 0;
          return bInc - aInc;
        }).map(m => m.id);
        this.orderedMemberIds.set(sorted);
      } else {
        this.orderedMemberIds.set(null);
      }

      this.includedMembers.set(inc);
      this.lockedShares.set(lock);
      const urls = exp.receipts || [];
      this.pendingReceipts.set(urls.map(url => ({ url })));
    } else {
      this.expForm = { desc: '', amount: 0, category: 'FOOD', payerId: this.currentUserId, date: new Date().toISOString().split('T')[0] };
      const inc: Record<string, boolean> = {};
      if (this.trip) this.trip.members.forEach((m: Member) => inc[m.id] = true);
      this.includedMembers.set(inc);
      this.lockedShares.set({});
      this.pendingReceipts.set([]);
      this.orderedMemberIds.set(null);
    }
  }

  async handleClose() {
    if (this.expForm.amount > 0 || this.expForm.desc.trim().length > 0 || this.pendingReceipts().length > 0) {
      const confirmRes = await this.confirmService.confirm(this.translationService.translate('modal.unsavedExpense'), this.translationService.translate('modal.warning'), this.translationService.translate('action.close'), this.translationService.translate('action.continue'));
      if (confirmRes) {
        this.onClose.emit();
      }
    } else {
      this.onClose.emit();
    }
  }

  // File handling
  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const arr = [...this.pendingReceipts()];
      for (let i = 0; i < input.files.length; i++) {
        arr.push({ url: URL.createObjectURL(input.files[i]), file: input.files[i] });
      }
      this.pendingReceipts.set(arr);
    }
    input.value = '';
  }

  removeReceipt(index: number, event: Event) {
    event.stopPropagation();
    const arr = [...this.pendingReceipts()];
    arr.splice(index, 1);
    this.pendingReceipts.set(arr);
  }

  openPendingReceiptViewer(index: number) {
    const urls = this.pendingReceipts().map(r => r.url);
    this.lightboxImages.set(urls);
    this.lightboxIndex.set(index);
    this.lightboxContext.set('PENDING');
  }

  removeCurrentLightboxImage() {
    const idx = this.lightboxIndex();
    const ctx = this.lightboxContext();
    if (idx === null || ctx !== 'PENDING') return;
    
    const arr = [...this.pendingReceipts()];
    arr.splice(idx, 1);
    this.pendingReceipts.set(arr);
    
    const newUrls = arr.map(r => r.url);
    if (newUrls.length === 0) {
      this.lightboxIndex.set(null);
      this.lightboxImages.set([]);
    } else {
      this.lightboxImages.set(newUrls);
      this.lightboxIndex.set(Math.min(idx, newUrls.length - 1));
    }
  }

  onLightboxScroll(event: Event) {
    const el = event.target as HTMLElement;
    const idx = Math.round(el.scrollLeft / window.innerWidth);
    const imgs = this.lightboxImages();
    if (imgs && idx >= 0 && idx < imgs.length && this.lightboxIndex() !== idx) {
      this.lightboxIndex.set(idx);
    }
  }

  // Amount handling
  onTotalAmountChange(val: any) {
    const oldTotal = this.expForm.amount || 0;
    const newTotal = val || 0;
    this.expForm.amount = newTotal;

    let totalLocked = 0;
    let floatCount = 0;
    const activeIds: string[] = [];
    
    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        activeIds.push(id);
        const l = this.lockedShares()[id];
        if (l != null) totalLocked += l;
        else floatCount++;
      }
    });

    if (floatCount === 0 && totalLocked > 0 && oldTotal > 0 && newTotal !== oldTotal) {
      const ratio = newTotal / totalLocked;
      this.lockedShares.update(locks => {
        const newLocks = { ...locks };
        let sum = 0;
        activeIds.forEach((id, index) => {
          if (index === activeIds.length - 1) {
            newLocks[id] = newTotal - sum;
          } else {
            const scaled = Math.round(newLocks[id]! * ratio);
            newLocks[id] = scaled;
            sum += scaled;
          }
        });
        return newLocks;
      });
    }
  }

  getPayerNameLocal(id: string): string {
    if (!this.trip) return 'Unknown';
    const m = this.trip.members.find((x: Member) => x.id === id);
    return m ? (m.id === this.currentUserId ? 'You' : m.name) : 'Unknown';
  }

  // Split Logic
  readonly currentTripMembersForSplit = computed(() => {
    this._refresh();
    let members = [...(this.trip?.members ?? []), ...this.pendingNewMembers()];
    const order = this.orderedMemberIds();
    
    if (order) {
      members.sort((a: Member, b: Member) => {
        let idxA = order.indexOf(a.id);
        let idxB = order.indexOf(b.id);
        if (idxA === -1) idxA = 9999;
        if (idxB === -1) idxB = 9999;
        return idxA - idxB;
      });
    }
    return members;
  });

  selectAllForSplit() {
    const included: Record<string, boolean> = {};
    this.currentTripMembersForSplit().forEach((m: Member) => included[m.id] = true);
    this.includedMembers.set(included);
    this.lockedShares.set({});
  }

  clearAllForSplit() {
    const included: Record<string, boolean> = {};
    this.currentTripMembersForSplit().forEach((m: Member) => included[m.id] = false);
    this.includedMembers.set(included);
    this.lockedShares.set({});
  }

  toggleMember(id: string) {
    this.includedMembers.update(m => ({ ...m, [id]: !m[id] }));
    if (!this.includedMembers()[id]) {
       this.lockedShares.update(m => ({ ...m, [id]: null })); 
    }
    
    this.lockedShares.update(locks => {
      const newLocks = { ...locks };
      const inc = this.includedMembers();
      const active = Object.keys(inc).filter(k => inc[k]);
      
      if (active.length <= 1) {
         active.forEach(k => newLocks[k] = null);
         return newLocks;
      }

      const floats = active.filter(k => newLocks[k] == null);
      if (active.length > 0 && floats.length === 0) {
        active.forEach(k => newLocks[k] = null);
      }
      return newLocks;
    });
  }

  setLockedAmountNum(memberId: string, value: number | null) {
    this.lockedShares.update(m => ({ ...m, [memberId]: value }));
    this.updateLockedValue(memberId, value == null ? '' : value.toString());
  }

  onMemberShareCommit(memberId: string, value: number | null) {
    if (value === 0) {
      this.includedMembers.update(m => ({ ...m, [memberId]: false }));
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      this.updateLockedValue(memberId, '');
    }
  }

  updateLockedValue(memberId: string, value: string) {
    const val = value.trim();
    const inc = this.includedMembers();
    const active = Object.keys(inc).filter(k => inc[k]);

    if (!val || active.length <= 1) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      return;
    }

    let num = 0;
    if (val.endsWith('%')) {
      num = (this.expForm.amount || 0) * (parseFloat(val) / 100);
    } else {
      num = parseFloat(val.replace(/[^0-9.]/g, ''));
    }

    if (isNaN(num)) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
    } else {
      this.lockedShares.update(locks => {
        const newLocks = { ...locks, [memberId]: Math.round(num) };
        const floats = active.filter(k => newLocks[k] == null);
        if (active.length > 0 && floats.length === 0) {
          active.forEach(k => {
            if (k !== memberId) newLocks[k] = null;
          });
        }
        return newLocks;
      });
    }
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    if (this.activeMemberCount() === 1) return this.expForm.amount || 0;

    const lockedAmount = this.lockedShares()[memberId];
    if (lockedAmount !== undefined && lockedAmount !== null) return lockedAmount;

    const total = this.expForm.amount || 0;
    let totalLocked = 0;
    let floatCount = 0;

    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l !== undefined && l !== null) totalLocked += l;
        else floatCount++;
      }
    });

    let remainder = total - totalLocked;
    return floatCount > 0 ? Math.round(Math.max(0, remainder) / floatCount) : 0;
  }

  isSplitExceedingTotal(): boolean {
    if (this.activeMemberCount() <= 1) return false;
    const total = this.expForm.amount || 0;
    let totalLocked = 0;
    let floatCount = 0;
    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l != null) totalLocked += l;
        else floatCount++;
      }
    });
    if (floatCount === 0 && totalLocked !== total) return true;
    return totalLocked > total;
  }

  async quickInviteMember() {
    const inputStr = this.newMemberEmail.trim();
    if (!inputStr || !this.trip) return;

    if (inputStr.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputStr)) {
        this.toastService.show('Invalid email format.', 'error');
        return;
      }
      if (this.trip.members.some((m: Member) => m.email === inputStr) || this.pendingNewMembers().some((m: any) => m.email === inputStr)) {
        this.toastService.show('Member already in trip or pending.', 'error');
        return;
      }

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
      const newMember = { id: tempId, name: inputStr.split('@')[0], email: inputStr, isMe: false, avatar: undefined };
      
      this.pendingNewMembers.update(list => [...list, newMember]);
      this.includedMembers.update(m => ({ ...m, [tempId]: true }));
    } else {
      const ghostId = window.crypto.randomUUID();
      const ghostMember = { id: ghostId, name: inputStr, email: undefined, isMe: false, avatar: undefined };
      
      const updatedMembers = [...this.trip.members, ghostMember];
      this.supabaseService.client.from('trips').update({ members: updatedMembers }).eq('id', this.trip.id).then();
      this.travelStore.updateTrip(this.trip.id, { members: updatedMembers });
      this.includedMembers.update(m => ({ ...m, [ghostId]: true }));
    }
    this.newMemberEmail = '';
  }

  async saveExpense() {
    if (!this.expForm.desc || !this.expForm.amount || !this.trip) return;
    const db = this.supabaseService.client;

    const pending = this.pendingNewMembers().filter(p => this.includedMembers()[p.id]);
    let idMap: Record<string, string> = {};
    if (pending.length > 0) {
      const emailListHtml = pending.map(p => `• <strong>${p.email}</strong>`).join('<br>');
      const msgHtml = `Có <b>${pending.length}</b> người mới vừa được thêm vào chưa nhận được thư mời:<br><br>${emailListHtml}<br><br>Bạn có muốn gửi lời mời cho họ tham gia trip này?`;
      
      const confirmResult = await this.confirmService.confirm(msgHtml, 'Mời người mới?', 'Yes, Invite', 'Huỷ bỏ');
      if (!confirmResult) return;
      
      this.isSavingExpense.set(true);
      try {
        const resolvedMembers: any[] = [];
        for (const p of pending) {
          let userId: string | null = null;
          let userName = p.name;
          let userAvatar: string | undefined = p.avatar;
          
          try {
            const { data, error } = await db.functions.invoke('invite-member', { body: { email: p.email } });
            if (!error && data?.userId) {
              userId = data.userId;
              try {
                const { data: userData } = await db.from('users').select('full_name, avatar_url').eq('id', userId).maybeSingle();
                if (userData?.['full_name']) userName = userData['full_name'];
                if (userData?.['avatar_url']) userAvatar = userData['avatar_url'];
              } catch(e) {}
            }
          } catch(err) { console.warn('Invite fail', p.email, err); }
          
          if (!userId) userId = crypto.randomUUID();
          
          idMap[p.id] = userId;
          resolvedMembers.push({ ...p, id: userId, name: userName, avatar: userAvatar });
        }
        
        const updatedTripMembers = [...this.trip.members, ...resolvedMembers];
        await db.from('trips').update({ members: updatedTripMembers }).eq('id', this.trip.id);
        this.travelStore.updateTrip(this.trip.id, { members: updatedTripMembers });
        
        const newIncludes: Record<string, boolean> = {};
        const newLocks: Record<string, number | null> = {};
        
        Object.keys(this.includedMembers()).forEach(k => {
          const mapId = idMap[k] || k;
          newIncludes[mapId] = this.includedMembers()[k];
        });
        Object.keys(this.lockedShares()).forEach(k => {
          const mapId = idMap[k] || k;
          newLocks[mapId] = this.lockedShares()[k];
        });

        if (idMap[this.expForm.payerId]) {
          this.expForm.payerId = idMap[this.expForm.payerId];
        }
        
        this.includedMembers.set(newIncludes);
        this.lockedShares.set(newLocks);
        this.pendingNewMembers.set([]);
      } catch (err) {
        this.toastService.show('Lỗi khi mời member', 'error');
        this.isSavingExpense.set(false);
        return;
      }
    }

    this.pendingNewMembers.set([]);
    this.isSavingExpense.set(true);
    this.travelStore.setGlobalLoading(true);

    const splits: Record<string, any> = {};
    let totalAssigned = 0;
    let lastMemberId: string | null = null;
    let fixedIds: string[] = [];
    
    try {
      this.currentTripMembersForSplit().forEach((m: Member) => {
        if (this.includedMembers()[m.id]) {
          const share = this.calcShare(m.id);
          splits[m.id] = share;
          totalAssigned += share;
          lastMemberId = m.id;
          if (this.lockedShares()[m.id] != null) fixedIds.push(m.id);
        }
      });

      if (lastMemberId && totalAssigned !== this.expForm.amount) {
         splits[lastMemberId] += (this.expForm.amount - totalAssigned);
      }

      splits['__date'] = this.expForm.date;
      if (this.editingExpense) splits['__isEdited'] = true;
      if (fixedIds.length > 0) splits['__fixed'] = fixedIds;

      const payload: any = {
        trip_id: this.trip.id,
        description: this.expForm.desc,
        amount: this.expForm.amount,
        category: this.expForm.category,
        payer_id: this.expForm.payerId,
        splits
      };
      
      if (!this.editingExpense) {
        payload.created_at = new Date().toISOString();
      }

      let finalReceiptUrls: string[] = [];
      const currentReceipts = this.pendingReceipts();
      for (const rec of currentReceipts) {
         if (rec.file) {
            const uid = this.currentUserId;
            const rPath = `receipts/${uid}/${Date.now()}_${rec.file.name.replace(/[^a-zA-Z0-9.\-]/g,'_')}`;
            const { data: rData, error: uploadErr } = await db.storage.from('nomadsync-media').upload(rPath, rec.file, { upsert: true });
            if (rData) {
               const { data: rUrlData } = db.storage.from('nomadsync-media').getPublicUrl(rPath);
               finalReceiptUrls.push(rUrlData.publicUrl);
            }
         } else {
            finalReceiptUrls.push(rec.url);
         }
      }

      payload.receipt_urls = finalReceiptUrls.length > 0 ? finalReceiptUrls : null;

      if (this.editingExpense) {
        const { data, error } = await db.from('expenses').update(payload).eq('id', this.editingExpense.id).select().single();
        if (error) throw error;
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['description'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['splits']?.['__date'] || (data['created_at'] ? data['created_at'].substring(0, 10) : this.expForm.date), 
          createdAt: data['created_at'], splits: data['splits'], receipts: data['receipt_urls'],
          isEdited: !!data['splits']?.['__isEdited']
        } as Expense);
        
        this.travelStore.insertActivityLog(this.trip.id, 'UPDATED_EXPENSE', 'EXPENSE', data['id'], data['description'] || 'an expense', { amount: data['amount'] });
      } else {
        const { data, error } = await db.from('expenses').insert(payload).select().single();
        if (error) throw error;
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['description'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['splits']?.['__date'] || (data['created_at'] ? data['created_at'].substring(0, 10) : this.expForm.date), 
          createdAt: data['created_at'], splits: data['splits'], receipts: data['receipt_urls'],
          isEdited: !!data['splits']?.['__isEdited']
        } as Expense);

        this.travelStore.insertActivityLog(this.trip.id, 'CREATED_EXPENSE', 'EXPENSE', data['id'], data['description'] || 'an expense', { amount: data['amount'] });
      }
      this.onClose.emit();
    } catch (err: any) {
      console.error('Save Expense Error:', err);
      this.toastService.show(err.message || 'Failed to save expense', 'error');
    } finally {
      this.isSavingExpense.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
