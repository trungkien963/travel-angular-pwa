import { Component, inject, signal, computed, OnInit, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Expense, Member, ExpenseCategory } from '../../core/models/expense.model';
import { Post, Comment } from '../../core/models/social.model';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MomentsComponent } from '../moments/moments.component';
import { SwipeToCloseDirective } from '../../shared/directives/swipe-to-close.directive';
import { CalculatorInputComponent } from '../../shared/components/calculator-input/calculator-input.component';
import * as XLSX from 'xlsx';

export interface Debt {
  fromId: string; fromName: string;
  toId: string; toName: string;
  amount: number;
}

const CATEGORY_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  FOOD:       { emoji: '🍔', label: 'Food',        color: '#F59E0B', bg: '#FEF3C7' },
  TRANSPORT:  { emoji: '🚕', label: 'Transport',   color: '#3B82F6', bg: '#DBEAFE' },
  HOTEL:      { emoji: '🏨', label: 'Hotel',       color: '#8B5CF6', bg: '#EDE9FE' },
  ACTIVITIES: { emoji: '🎯', label: 'Activities',  color: '#10B981', bg: '#D1FAE5' },
  SHOPPING:   { emoji: '🛍️', label: 'Shopping',   color: '#EC4899', bg: '#FCE7F3' },
  SETTLEMENT: { emoji: '💸', label: 'Settlement',  color: '#10B981', bg: '#D1FAE5' },
  OTHER:      { emoji: '💳', label: 'Other',       color: '#6B7280', bg: '#F3F4F6' },
};

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { LowerCasePipe } from '@angular/common';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [FormsModule, MomentsComponent, SwipeToCloseDirective, CalculatorInputComponent, TranslatePipe, LowerCasePipe],
  templateUrl: './trip-detail.component.html',
  styleUrl: './trip-detail.component.scss'
})
export class TripDetailComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  readonly defaultCover = 'https://images.unsplash.com/photo-1473496169904-6a58eb22bf2f?q=80&w=1000';

  readonly tabs = ['MOMENTS', 'SOCIAL', 'EXPENSES', 'BALANCES', 'MEMBERS', 'ACTIVITY'];
  activeTab = 'SOCIAL';
  quickPostMode = false;

  // ─── Edit Trip State ────────────────────────────────────────────────────────
  editTripModal = false;
  isCoverLoading = signal(false);
  editTripTitle = '';
  editTripLocation = '';
  editTripStartDate = '';
  editTripEndDate = '';
  editTripCoverPreviewUrl: string | null = null;
  editTripCoverFile: File | null = null;
  readonly editLocationSuggestions = signal<any[]>([]);
  readonly isEditLocationLoading = signal(false);
  private editLocationTimeout: any;
  readonly isSavingTrip = signal(false);
  @ViewChild('editFileInput') editFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('receiptScrollContainer') receiptScrollContainer!: ElementRef<HTMLDivElement>;

  openEditTrip() {
    const t = this.trip();
    if (!t) return;
    this.editTripTitle = t.title || '';
    this.editTripLocation = t.locationName || '';
    this.editTripStartDate = t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : '';
    this.editTripEndDate = t.endDate ? new Date(t.endDate).toISOString().split('T')[0] : '';
    this.editTripCoverPreviewUrl = t.coverImage || null;
    this.editTripCoverFile = null;
    this.editTripModal = true;
  }

  closeEditTrip() {
    this.editTripModal = false;
  }

  triggerEditImageInput() {
    if (this.editFileInput?.nativeElement) {
      this.editFileInput.nativeElement.click();
    }
  }

  onEditImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editTripCoverFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        this.editTripCoverPreviewUrl = e.target?.result as string;
        this.cdr.detectChanges();
      });
    };
    reader.readAsDataURL(file);
  }

  onEditLocationChange(query: string) {
    clearTimeout(this.editLocationTimeout);
    if (!query || query.trim().length < 2) {
      this.editLocationSuggestions.set([]);
      this.isEditLocationLoading.set(false);
      return;
    }
    
    this.isEditLocationLoading.set(true);
    this.editLocationTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        this.editLocationSuggestions.set(data);
      } catch (err) {
        console.error('Failed to fetch locations', err);
        this.editLocationSuggestions.set([]);
      } finally {
        this.isEditLocationLoading.set(false);
      }
    }, 400);
  }

  selectEditLocation(loc: any) {
    this.editTripLocation = loc.display_name;
    this.editLocationSuggestions.set([]);
  }

  openEditDatePicker(event: Event, inputEl: HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
      } else {
        inputEl.click();
      }
    } catch (e) {
      console.warn('Native date picker not supported or cannot be opened programmatically.', e);
    }
  }

  async saveEditTrip() {
    if (!this.editTripTitle.trim()) {
      this.toastService.show('Please enter a trip title!', 'error');
      return;
    }
    if (this.editTripStartDate > this.editTripEndDate) {
      this.toastService.show('Start date must be before end date!', 'error');
      return;
    }
    
    const t = this.trip();
    if (!t) return;
    
    this.isSavingTrip.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const db = this.supabaseService.client;
      let finalCoverUrl = t.coverImage;

      if (this.editTripCoverFile) {
        try {
          const ext = this.editTripCoverFile.name.split('.').pop();
          const path = `covers/${Date.now()}.${ext}`;
          const { data, error } = await db.storage
            .from('nomadsync-media')
            .upload(path, this.editTripCoverFile, { contentType: this.editTripCoverFile.type });
            
          if (!error && data) {
            const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
            finalCoverUrl = urlData.publicUrl;
            
            // Delete old cover if it's from our storage bucket
            if (t.coverImage && t.coverImage.includes('/nomadsync-media/')) {
               const oldPath = t.coverImage.split('/nomadsync-media/')[1];
               if (oldPath) {
                 await db.storage.from('nomadsync-media').remove([oldPath]);
               }
            }
          }
        } catch (e) {
          console.warn('Cover upload failed', e);
        }
      }

      const updateData = {
        title: this.editTripTitle,
        cover_image: finalCoverUrl,
        location_name: this.editTripLocation || null,
        location_city: this.editTripLocation || null,
        start_date: this.editTripStartDate,
        end_date: this.editTripEndDate,
      };

      const { error } = await db.from('trips').update(updateData).eq('id', t.id);
      if (error) throw error;

      this.ngZone.run(() => {
        this.travelStore.updateTrip(t.id, {
          title: this.editTripTitle,
          coverImage: finalCoverUrl,
          locationName: this.editTripLocation || undefined,
          locationCity: this.editTripLocation || undefined,
          startDate: this.editTripStartDate,
          endDate: this.editTripEndDate
        });
        
        this.toastService.show('Trip updated successfully!', 'success');
        this.closeEditTrip();
        if (this.editTripCoverFile) {
          this.isCoverLoading.set(true);
        }
      });
    } catch (err: any) {
      this.ngZone.run(() => {
        this.toastService.show(err.message || 'Failed to update trip.', 'error');
      });
    } finally {
      this.ngZone.run(() => {
        this.isSavingTrip.set(false);
        this.travelStore.setGlobalLoading(false);
      });
    }
  }

  onCoverLoaded() {
    this.isCoverLoading.set(false);
  }
  
  // ─── Settlement state ──────────────────────────────────────────
  readonly settleModalOpen = signal(false);
  readonly settleDebt = signal<Debt | null>(null);
  settleAmount = 0;
  readonly isSavingSettle = signal(false);
  
  openSettleModal(debt: Debt) {
    this.settleDebt.set(debt);
    this.settleAmount = debt.amount;
    this.settleModalOpen.set(true);
  }
  
  closeSettleModal() {
    this.settleModalOpen.set(false);
    this.settleDebt.set(null);
  }
  
  onSettleAmountChange(val: any) {
    this.settleAmount = val || 0;
  }
  
  async submitSettle() {
    const debt = this.settleDebt();
    if (!debt || this.settleAmount <= 0) return;
    
    this.isSavingSettle.set(true);
    this.travelStore.setGlobalLoading(true);
    try {
      const expDate = new Date().toISOString().split('T')[0];
      const db = this.supabaseService.client;
      // We model settlement as: Payer = Debtor. Split = { Creditor: amount }
      const splits: Record<string, any> = {
        [debt.toId]: this.settleAmount,
        '__date': expDate,
        '__isSettlement': true
      };

      const payload = {
         trip_id: this.tripId(),
         description: debt.fromName + ' ➔ ' + debt.toName,
         amount: this.settleAmount,
         category: 'OTHER',
         payer_id: debt.fromId,
         splits,
         created_at: new Date().toISOString()
      };
      
      const { data, error } = await db.from('expenses').insert(payload).select().single();
      if (error) throw error;
      
      if (data) {
        this.travelStore.addExpense({
           id: data['id'], tripId: data['trip_id'], desc: data['description'],
           amount: data['amount'], category: (splits['__isSettlement'] ? 'SETTLEMENT' : data['category']) as ExpenseCategory,
           payerId: data['payer_id'], date: expDate, 
           createdAt: data['created_at'], splits: data['splits']
        });
      }
      
      this.closeSettleModal();
      this.toastService.show('Đã ghi nhận thanh toán!', 'success');
      
    } catch(err) {
      console.error(err);
      this.toastService.show('Lỗi ghi nhận thanh toán', 'error');
    } finally {
      this.isSavingSettle.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  selectedExpense: Expense | null = null;

  readonly expenseModalOpen = signal(false);
  readonly isSavingExpense = signal(false);
  editingExpense: Expense | null = null;
  
  readonly pendingReceipts = signal<{url: string, file?: File}[]>([]);

  async closeExpenseModal() {
    if (this.expForm.amount > 0 || this.expForm.desc.trim().length > 0 || this.pendingReceipts().length > 0) {
      if (await this.confirmService.confirm(this.translationService.translate('modal.unsavedExpense'), this.translationService.translate('modal.warning'), this.translationService.translate('action.close'), this.translationService.translate('action.continue'))) {
        this.expenseModalOpen.set(false);
      }
    } else {
      this.expenseModalOpen.set(false);
    }
  }
  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);
  readonly lightboxContext = signal<'PENDING' | 'SAVED' | null>(null);

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const arr = [...this.pendingReceipts()];
      for (let i = 0; i < input.files.length; i++) {
        arr.push({
           url: URL.createObjectURL(input.files[i]),
           file: input.files[i]
        });
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

  // ─── Comments modal state ──────────────────────────────────────────────
  readonly commentPostId = signal<string | null>(null);
  
  readonly activeCommentPost = computed(() => {
    const id = this.commentPostId();
    if (!id) return null;
    return this.tripPosts().find(p => p.id === id) || null;
  });

  commentText = '';
  readonly isSendingComment = signal(false);

  // ─── Edit Post modal state ─────────────────────────────────────────────
  readonly editPostOpen = signal(false);
  editPostObj: Post | null = null;

  async closeEditPostLocal() {
    if (this.editPostContent.trim() !== (this.editPostObj?.content || '')) {
      if (await this.confirmService.confirm(this.translationService.translate('modal.unsavedChanges'), this.translationService.translate('modal.warning'), this.translationService.translate('action.close'), this.translationService.translate('action.continue'))) {
        this.editPostOpen.set(false);
      }
    } else {
      this.editPostOpen.set(false);
    }
  }
  editPostContent = '';
  readonly isSavingPost = signal(false);
  readonly activeMenuId = signal<string | null>(null);

  toggleMenu(postId: string) {
    this.activeMenuId.update(id => id === postId ? null : postId);
  }

  // ─── Image Carousel State ──────────────────────────────────────────────
  activeImageIndex = signal<Record<string, number>>({});

  onImageScroll(postId: string, event: Event) {
    const target = event.target as HTMLElement;
    // We calculate index based on scrollLeft divided by the width of the container. 
    // Since images are 100% width minus padding, and gap is 8px, scrollWidth/children is roughly one image width.
    const scrollLeft = target.scrollLeft;
    const clientWidth = target.clientWidth;
    // Estimate image width (taking padding into account roughly)
    const index = Math.round(scrollLeft / (clientWidth - 32));
    
    // Only update if changed to avoid unnecessary change detection cycles
    const current = this.activeImageIndex()[postId] || 0;
    if (current !== index) {
      this.activeImageIndex.update(m => ({ ...m, [postId]: index }));
    }
  }

  getActiveImageIndex(postId: string): number {
    return this.activeImageIndex()[postId] || 0;
  }


  // ─── Add Member modal state ───────────────────────────────────────────
  readonly addMemberOpen = signal(false);
  newMemberName = '';
  newMemberEmail = '';
  readonly isInviting = signal(false);
  readonly inviteStatus = signal('');
  readonly inviteSuccess = signal(false);

  async closeAddMember() {
    if (this.newMemberName.trim() || this.newMemberEmail.trim()) {
      if (await this.confirmService.confirm(this.translationService.translate('modal.unsavedInfo'), this.translationService.translate('modal.warning'), this.translationService.translate('action.close'), this.translationService.translate('action.continue'))) {
        this.addMemberOpen.set(false);
      }
    } else {
      this.addMemberOpen.set(false);
    }
  }

  // ─── Edit Member modal state ──────────────────────────────────────────
  readonly editMemberOpen = signal(false);
  editingMember: Member | null = null;
  editMemberName = '';
  editMemberEmail = '';
  readonly isSavingMember = signal(false);

  // Expense form state
  expForm: { desc: string; amount: number; category: string; payerId: string; date: string } = {
    desc: '', amount: 0, category: 'OTHER', payerId: '', date: new Date().toISOString().split('T')[0]
  };
  
  // Split logic state
  readonly includedMembers = signal<Record<string, boolean>>({});
  readonly activeMemberCount = computed(() => {
    const inc = this.includedMembers();
    return Object.values(inc).filter(v => v).length;
  });
  readonly lockedShares = signal<Record<string, number | null>>({});
  readonly editingMemberId = signal<string | null>(null);

  readonly pendingNewMembers = signal<any[]>([]);
  readonly currentTripMembersForSplit = computed(() => {
    return [...(this.trip()?.members ?? []), ...this.pendingNewMembers()];
  });

  get formattedTotalAmount(): string {
    return this.expForm.amount ? this.formatNumber(this.expForm.amount) : '';
  }

  setTotalAmount(val: string) {
    const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
    this.expForm.amount = isNaN(parsed) ? 0 : parsed;
  }

  onTotalAmountChange(val: any) {
    this.expForm.amount = val || 0;
    this.lockedShares.set({});
  }

  showPayerList = false;

  getPayerNameLocal(id: string): string {
    if (!this.trip()) return 'Unknown';
    const m = this.trip()?.members.find(x => x.id === id);
    return m ? (m.id === this.currentUserId() ? 'You' : m.name) : 'Unknown';
  }

  selectAllForSplit() {
    const included: Record<string, boolean> = {};
    this.currentTripMembersForSplit().forEach(m => included[m.id] = true);
    this.includedMembers.set(included);
    this.lockedShares.set({});
  }

  clearAllForSplit() {
    const included: Record<string, boolean> = {};
    this.currentTripMembersForSplit().forEach(m => included[m.id] = false);
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

  startEdit(memberId: string) {
    this.editingMemberId.set(memberId);
  }

  setLockedAmount(memberId: string, value: string) {
    this.editingMemberId.set(null);
    this.updateLockedValue(memberId, value);
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

    // Safety: If only 1 member is active, they mathematically must pay the full amount.
    if (this.activeMemberCount() === 1) {
      return this.expForm.amount || 0;
    }

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
    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l != null) totalLocked += l;
      }
    });
    return totalLocked > total;
  }

  onInputSplitAmount(memberId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const val = input.value.trim();
    if (val.endsWith('%')) {
      // let it be
    } else {
      const raw = val.replace(/[^0-9]/g, '');
      const num = parseInt(raw, 10);
      if (!isNaN(num)) {
        input.value = num.toLocaleString('en-US');
      } else {
        input.value = '';
      }
    }
    this.updateLockedValue(memberId, input.value);
  }

  // ─── Direct Member Invite ──────────────────────────────────────────────────
  async quickInviteMember() {
    const inputStr = this.newMemberEmail.trim();
    if (!inputStr) return;
    
    const trip = this.trip();
    if (!trip) return;

    if (inputStr.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputStr)) {
        this.toastService.show('Invalid email format.', 'error');
        return;
      }
      if (trip.members.some(m => m.email === inputStr) || this.pendingNewMembers().some(m => m.email === inputStr)) {
        this.toastService.show('Member already in trip or pending.', 'error');
        return;
      }

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
      const newMember = { id: tempId, name: inputStr.split('@')[0], email: inputStr, isMe: false, avatar: undefined };
      
      this.pendingNewMembers.update(list => [...list, newMember]);
      this.includedMembers.update(m => ({ ...m, [tempId]: true }));
    } else {
      // Name only -> Immediate Ghost User
      const ghostId = window.crypto.randomUUID();
      const ghostMember = { id: ghostId, name: inputStr, email: undefined, isMe: false, avatar: undefined };
      
      const updatedMembers = [...trip.members, ghostMember];
      this.supabaseService.client.from('trips').update({ members: updatedMembers }).eq('id', trip.id).then();
      this.travelStore.updateTrip(trip.id, { members: updatedMembers });
      this.includedMembers.update(m => ({ ...m, [ghostId]: true }));
    }
    this.newMemberEmail = '';
  }

  readonly categories = Object.entries(CATEGORY_META).map(([id, v]) => ({
    id, emoji: v.emoji, label: v.label
  }));

  // ─── Derived State ────────────────────────────────────────────────────────
  readonly tripId = signal('');
  readonly currentUserId = computed(() => this.travelStore.currentUserId());

  readonly trip = computed<Trip | null>(() => {
    const id = this.tripId();
    const t = this.travelStore.trips().find(t => t.id === id) ?? null;
    if (t && t.isPrivate) {
      const uid = this.currentUserId();
      if (!t.members?.some(m => m.id === uid)) {
        return null;
      }
    }
    return t;
  });

  readonly isOwner = computed(() => {
    const t = this.trip();
    return t?.ownerId === this.currentUserId();
  });

  readonly isMember = computed(() => {
    const t = this.trip();
    if (!t) return false;
    return t.members?.some(m => m.id === this.currentUserId()) ?? false;
  });

  readonly tripExpenses = computed<Expense[]>(() => {
    return this.travelStore.expenses()
      .filter(e => e['tripId'] === this.tripId())
      .map(e => e.splits?.['__isSettlement'] ? { ...e, category: 'SETTLEMENT' as ExpenseCategory } : e)
      .sort((a, b) => {
        // Sort by createdAt if available, otherwise by date descending
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return timeB - timeA;
      });
  });

  readonly tripActivities = computed(() => {
    return this.travelStore.activityLogs()
      .filter(a => a.tripId === this.tripId())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  readonly activeExpenseFilter = signal<'ALL' | 'MINE'>('ALL');

  readonly displayExpenses = computed(() => {
    const expenses = this.tripExpenses();
    const uid = this.currentUserId();
    const filter = this.activeExpenseFilter();
    
    const mapped = expenses.map(ex => {
      let mySplitAmount = 0;
      let hasSplit = false;
      
      if (ex.splits && Object.keys(ex.splits).filter(k => !k.startsWith('__')).length > 0) {
        if (ex.splits[uid] !== undefined) {
           mySplitAmount = ex.splits[uid];
           hasSplit = true;
        }
      } else {
         const tripObj = this.trip();
         if (tripObj && tripObj.members) {
           const membersCount = tripObj.members.length || 1;
           const isMember = tripObj.members.some(m => m.id === uid);
           if (isMember) {
              mySplitAmount = Math.round(ex.amount / membersCount);
              hasSplit = true;
           }
         }
      }

      const isInvolved = ex.category === 'SETTLEMENT' 
        ? (ex.payerId === uid || mySplitAmount > 0 || ex.splits?.[uid] !== undefined)
        : (hasSplit && mySplitAmount > 0);
      
      let netImpact = 0;
      if (ex.category === 'SETTLEMENT') {
        if (ex.payerId === uid) {
          netImpact = -ex.amount; // You sent money
        } else if (ex.splits && ex.splits[uid] !== undefined) {
          netImpact = ex.amount; // You received money
        } else {
          netImpact = 0;
        }
      } else {
        const paid = ex.payerId === uid ? ex.amount : 0;
        netImpact = paid - mySplitAmount;
      }

      // Cleanup "Payment: " prefix string if exists
      let cleanDesc = ex.desc || this.getCategoryLabel(ex.category || 'OTHER');
      if (ex.category === 'SETTLEMENT' && cleanDesc.startsWith('Payment: ')) {
        cleanDesc = cleanDesc.substring(9).replace(' -> ', ' ➔ ');
      }

      return { ...ex, mySplitAmount, isInvolved, netImpact, cleanDesc };
    });

    if (filter === 'MINE') {
       return mapped.filter(ex => ex.isInvolved);
    }
    
    return mapped;
  });

  readonly displayExpensesGrouped = computed(() => {
     const list = this.displayExpenses();
     const groups: { date: string; expenses: any[] }[] = [];
     
     list.forEach(exp => {
        const d = exp.date || 'Unknown Date';
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.date === d) {
           lastGroup.expenses.push(exp);
        } else {
           groups.push({ date: d, expenses: [exp] });
        }
     });
     return groups;
  });

  readonly tripPosts = computed<Post[]>(() =>
    this.travelStore.posts().filter(p => p.tripId === this.tripId())
  );

  readonly tripPostsGroups = computed(() => {
    const posts = this.tripPosts();
    const groups: { dateLabel: string; posts: Post[] }[] = [];
    const map = new Map<string, Post[]>();
    
    posts.forEach(p => {
      // Use device local string without year for cleaner look
      const dateStr = new Date(p.timestamp).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      });
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(p);
    });

    map.forEach((pts, dateLabel) => {
      groups.push({ dateLabel, posts: pts });
    });

    return groups;
  });

  readonly totalTripCost = computed(() =>
    this.tripExpenses().reduce((sum, e) => sum + (e.category === 'SETTLEMENT' ? 0 : e.amount), 0)
  );

  readonly yourShare = computed(() => {
    const uid = this.currentUserId();
    const members = this.trip()?.members?.length || 1;
    return this.tripExpenses().reduce((sum, e) => {
      if (e.category === 'SETTLEMENT') return sum;
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
        return sum + (e.splits[uid] || 0);
      }
      return sum + Math.round(e.amount / members);
    }, 0);
  });

  readonly chartData = computed(() => {
    const totals: Record<string, number> = {};
    let grand = 0;
    this.tripExpenses().forEach(e => {
      if (e.category === 'SETTLEMENT') return;
      const cat = e.category || 'OTHER';
      totals[cat] = (totals[cat] || 0) + e.amount;
      grand += e.amount;
    });
    if (!grand) return [];
    return Object.entries(totals).map(([category, amount]) => ({
      category,
      amount,
      percent: (amount / grand) * 100,
      color: CATEGORY_META[category]?.color || '#9CA3AF'
    })).sort((a, b) => b.amount - a.amount);
  });

  readonly debts = computed<Debt[]>(() => {
    const expenses = this.tripExpenses();
    const members = this.trip()?.members || [];
    if (!members.length) return [];

    const balance: Record<string, number> = {};
    members.forEach(m => balance[m.id] = 0);

    expenses.forEach(exp => {
      const paidAmount = exp.amount;
      balance[exp.payerId] = (balance[exp.payerId] || 0) + paidAmount;
      if (exp.splits && Object.keys(exp.splits).filter(k => !k.startsWith('__')).length > 0) {
        Object.entries(exp.splits).forEach(([uid, share]) => {
          if (!uid.startsWith('__')) {
            balance[uid] = (balance[uid] || 0) - (share as number);
          }
        });
      } else {
        const share = paidAmount / members.length;
        members.forEach(m => {
          balance[m.id] = (balance[m.id] || 0) - share;
        });
      }
    });

    const creditors = Object.entries(balance).filter(([, v]) => v > 1).map(([id, v]) => ({ id, amount: v }));
    const debtors   = Object.entries(balance).filter(([, v]) => v < -1).map(([id, v]) => ({ id, amount: -v }));

    // Sort by largest debts/credits first for efficient greedy matching
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const result: Debt[] = [];
    
    let i = 0; // debtors index
    let j = 0; // creditors index

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settled = Math.min(debtor.amount, creditor.amount);

      if (settled > 0) {
        const fromMember = members.find(m => m.id === debtor.id);
        const toMember = members.find(m => m.id === creditor.id);
        
        result.push({
          fromId: debtor.id, fromName: fromMember?.name || debtor.id,
          toId: creditor.id, toName: toMember?.name || creditor.id,
          amount: Math.round(settled)
        });
      }

      debtor.amount -= settled;
      creditor.amount -= settled;

      if (debtor.amount < 1) i++;
      if (creditor.amount < 1) j++;
    }

    const uid = this.currentUserId();
    result.sort((a, b) => {
      const getRank = (d: Debt) => {
        if (d.toId === uid) return 1; // Current user receives
        if (d.fromId === uid) return 2; // Current user owes
        return 3; // Others
      };
      const rankA = getRank(a);
      const rankB = getRank(b);
      
      if (rankA !== rankB) return rankA - rankB;
      // Secondary sort: amount descending
      return b.amount - a.amount;
    });

    return result;
  });

  readonly totalYouOwe = computed(() => {
    const uid = this.currentUserId();
    return this.debts()
      .filter(d => d.fromId === uid)
      .reduce((sum, d) => sum + d.amount, 0);
  });

  readonly totalOwedToYou = computed(() => {
    const uid = this.currentUserId();
    return this.debts()
      .filter(d => d.toId === uid)
      .reduce((sum, d) => sum + d.amount, 0);
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.tripId.set(id);

    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && this.tabs.includes(tab)) this.activeTab = tab;

    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }

    // Load isolated dependencies for this trip guaranteeing consistency regardless of Realtime dropouts
    await this.loadExpenses();
    await this.loadPosts();

    // Set default payer to current user
    this.expForm.payerId = this.currentUserId();
  }

  private async loadExpenses() {
    const db = this.supabaseService.client;
    const { data } = await db.from('expenses').select('*').eq('trip_id', this.tripId()).order('created_at', { ascending: false });
    if (data) {
      data.forEach((row: any) => {
        let parsedSplits = row.splits;
        if (typeof parsedSplits === 'string') {
          try { parsedSplits = JSON.parse(parsedSplits); } catch (e) { parsedSplits = {}; }
        }
        if (!parsedSplits || typeof parsedSplits !== 'object') parsedSplits = {};

        const expense: Expense = {
          id: row.id,
          tripId: row.trip_id,
          desc: row.description,
          amount: row.amount,
          category: row.category,
          payerId: row.payer_id,
          date: parsedSplits['__date'] || (row.created_at ? row.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10)),
          createdAt: row.created_at,
          splits: parsedSplits,
          receipts: row.receipt_urls || [],
          isEdited: !!parsedSplits['__isEdited']
        };
        this.travelStore.upsertExpense(expense);
      });
    }
  }

  private async loadPosts() {
    const db = this.supabaseService.client;
    const { data } = await db.from('posts').select('*').eq('trip_id', this.tripId()).order('created_at', { ascending: false });
    if (data) {
      const trip = this.trip();
      data.forEach((p: any) => {
        const author = trip?.members?.find(m => m.id === p.user_id);
        let parsedLikes = p.likes;
        if (typeof parsedLikes === 'string') {
          try { parsedLikes = JSON.parse(parsedLikes); } catch (e) { parsedLikes = []; }
        }
        if (!Array.isArray(parsedLikes)) parsedLikes = [];

        let parsedComments = p.comments;
        if (typeof parsedComments === 'string') {
          try { parsedComments = JSON.parse(parsedComments); } catch (e) { parsedComments = []; }
        }
        if (!Array.isArray(parsedComments)) parsedComments = [];

        let parsedImages = p.image_urls;
        if (typeof parsedImages === 'string') {
          try { parsedImages = JSON.parse(parsedImages); } catch (e) { parsedImages = []; }
        }
        if (!Array.isArray(parsedImages)) parsedImages = [];

        const post: Post = {
          id: p.id,
          tripId: p.trip_id,
          authorId: p.user_id,
          authorName: author?.name || 'Traveler',
          authorAvatar: author?.avatar,
          content: p.content || '',
          images: parsedImages,
          isDual: p.is_dual_camera || false,
          timestamp: p.created_at || new Date().toISOString(),
          date: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          likes: parsedLikes.length,
          hasLiked: parsedLikes.includes(this.currentUserId()),
          comments: parsedComments
        };
        // Update local store ensuring we overwrite stale with fresh HTTP data
        this.travelStore.updatePost(post.id, post);
        if (!this.travelStore.posts().find(existing => existing.id === post.id)) {
           this.travelStore.addPost(post);
        }
      });
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  goBack() { this.router.navigate(['/trips']); }
  private _hasScrolledToInitialTab = false;
  private _tabCarousel!: ElementRef<HTMLDivElement>;

  @ViewChild('tabCarousel') 
  set tabCarousel(ref: ElementRef<HTMLDivElement>) {
    if (ref && !this._hasScrolledToInitialTab) {
      this._hasScrolledToInitialTab = true;
      setTimeout(() => {
        const el = ref.nativeElement;
        const index = this.tabs.indexOf(this.activeTab);
        if (index > 0) {
          el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' as ScrollBehavior });
          const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
          if (tabEl) tabEl.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' });
        }
      }, 100); // slight delay to ensure DOM is rendered and styled
    }
    this._tabCarousel = ref;
  }
  
  get tabCarousel(): ElementRef<HTMLDivElement> {
    return this._tabCarousel;
  }

  ngAfterViewInit() {
    // Scroll logic moved to tabCarousel setter to handle async rendering
  }

  setTab(tab: string) { 
    const currentIndex = this.tabs.indexOf(this.activeTab);
    const nextIndex = this.tabs.indexOf(tab);
    if (currentIndex === nextIndex) return;

    this.activeTab = tab; 
    
    // Smoothly scroll the tab header button into view
    const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    if (this.tabCarousel?.nativeElement) {
      const el = this.tabCarousel.nativeElement;
      el.scrollTo({ left: nextIndex * el.clientWidth, behavior: 'smooth' });
    }
  }

  onTabScroll(event: Event) {
    const el = event.target as HTMLElement;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (this.tabs[index] && this.activeTab !== this.tabs[index]) {
      this.activeTab = this.tabs[index];
      
      // Smoothly scroll the tab header button into view
      const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
      if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  navigateToAddMoment() {
    this.router.navigate(['/add-moment'], { queryParams: { tripId: this.tripId() } });
  }

  // ─── Social ───────────────────────────────────────────────────────────────
  async toggleLike(postId: string) {
    if (!this.isMember()) return;
    const db = this.supabaseService.client;
    const uid = this.currentUserId();
    const post = this.tripPosts().find(p => p.id === postId);
    if (!post) return;

    // Optimistic update (local UI)
    const newLiked = !post.hasLiked;
    const newLikes = newLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
    this.travelStore.updatePost(postId, { hasLiked: newLiked, likes: newLikes });

    this.travelStore.setGlobalLoading(true);
    try {
      const { data, error } = await db
        .from('posts').select('likes').eq('id', postId).single();
      if (error) throw error;

      let currentLikes: string[] = [];
      if (data && data['likes']) {
        const raw = data['likes'];
        if (Array.isArray(raw)) {
          currentLikes = raw;
        } else if (typeof raw === 'string') {
          try { currentLikes = JSON.parse(raw); } catch (e) { currentLikes = []; }
        }
      }
      
      const userIndex = currentLikes.indexOf(uid);
      let updatedLikes: string[];

      if (newLiked) {
        updatedLikes = userIndex === -1 ? [...currentLikes, uid] : currentLikes;
      } else {
        updatedLikes = currentLikes.filter(id => id !== uid);
      }

      const { error: updateError } = await db
        .from('posts').update({ likes: updatedLikes }).eq('id', postId);
      if (updateError) throw updateError;

      this.travelStore.updatePost(postId, {
        hasLiked: updatedLikes.includes(uid),
        likes: updatedLikes.length
      });
    } catch (err: any) {
      this.travelStore.updatePost(postId, { hasLiked: post.hasLiked, likes: post.likes });
      console.error('toggleLike failed:', err);
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  openComments(post: Post) {
    this.commentPostId.set(post.id);
    this.commentText = '';
  }

  closeComments() {
    this.commentPostId.set(null);
    this.commentText = '';
  }

  async sendComment() {
    const text = this.commentText.trim();
    const activePost = this.activeCommentPost();
    if (!text || !activePost) return;
    
    this.isSendingComment.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const uid = this.travelStore.currentUserId();
      const profile = this.travelStore.currentUserProfile();
      const member = this.trip()?.members.find(m => m.id === uid);
      const authorName = profile?.name || member?.name || 'Traveler';

      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: uid,
        authorName,
        authorAvatar: profile?.avatar || undefined,
        text,
        timestamp: new Date().toISOString()
      };

      const existingComments = activePost.comments || [];
      const updatedComments = [...existingComments, newComment];

      // Optimistic local state update
      this.travelStore.updatePost(activePost.id, { comments: updatedComments });
      this.commentText = '';

      // Update Supabase using RPC to avoid race conditions on JSONB arrays
      const db = this.supabaseService.client;
      const { error } = await db.rpc('add_post_comment', {
        p_post_id: activePost.id,
        p_comment: newComment
      });
      
      if (error) {
        // Fallback to traditional update if RPC is not available in the database yet
        console.warn('RPC failed, falling back to full array replace:', error);

        // Fetch the absolute latest `comments` array from the database just before we flush to avoid overwriting someone else's concurrent comment.
        const { data: freshPost } = await db.from('posts').select('comments').eq('id', activePost.id).single();
        
        let freshComments = [];
        if (freshPost) {
          const raw = freshPost['comments'];
          if (Array.isArray(raw)) {
            freshComments = raw;
          } else if (typeof raw === 'string') {
            try { freshComments = JSON.parse(raw); } catch (e) { freshComments = []; }
          }
        }
        
        const safelyMergedComments = [...freshComments, newComment];
        await db.from('posts').update({ comments: safelyMergedComments }).eq('id', activePost.id);
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to send comment.', 'error');
    } finally {
      this.isSendingComment.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deletePost(postId: string) {
    const confirmed = await this.confirmService.confirm('Delete this post?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    const post = this.tripPosts().find(p => p.id === postId);
    this.travelStore.setGlobalLoading(true);
    try {
      // 1. Collect Storage paths before deletion
      const pathsToDelete = (post?.images || [])
        .filter(url => url && url.includes('/nomadsync-media/'))
        .map(url => url.split('/nomadsync-media/')[1]);

      // 2. Clear image_urls first to bypass Postgres storage triggers
      if (pathsToDelete.length > 0) {
        await db.from('posts').update({ image_urls: null }).eq('id', postId);
      }

      // 3. Delete the post row
      const { error } = await db.from('posts').delete().eq('id', postId);
      if (error) throw error;

      // 4. Remove orphaned files from Storage bucket
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }

      // 5. Update local store
      this.travelStore.removePost(postId);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete post.', 'error');
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Edit Post ────────────────────────────────────────────────────────────
  openEditPost(post: Post) {
    this.editPostObj = post;
    this.editPostContent = post.content || '';
    this.editPostOpen.set(true);
  }

  async saveEditPost() {
    if (!this.editPostObj) return;
    const db = this.supabaseService.client;
    this.isSavingPost.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const { error } = await db
        .from('posts')
        .update({ content: this.editPostContent })
        .eq('id', this.editPostObj.id);

      if (error) throw error;

      this.travelStore.updatePost(this.editPostObj.id, { content: this.editPostContent });
      this.editPostOpen.set(false);
      this.editPostObj = null;
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to edit post.', 'error');
    } finally {
      this.isSavingPost.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Share Post ───────────────────────────────────────────────────────────
  async sharePost(post: Post) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `WanderPool Moment: ${post.authorName}`,
          text: post.content || 'Check out this moment on WanderPool!',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    } else {
      // Fallback for browsers that don't support the Web Share API (copy to clipboard)
      try {
        await navigator.clipboard.writeText(window.location.href);
        this.toastService.show('Link copied to clipboard!', 'success');
      } catch (err) {
        this.toastService.show('Failed to copy link. Please manually copy the URL.', 'error');
      }
    }
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  openExpenseModal() {
    this.editingExpense = null;
    this.expForm = { desc: '', amount: 0, category: 'FOOD', payerId: this.currentUserId(), date: new Date().toISOString().split('T')[0] };
    const inc: Record<string, boolean> = {};
    const trip = this.trip();
    if (trip) trip.members.forEach(m => inc[m.id] = true);
    this.includedMembers.set(inc);
    this.lockedShares.set({});
    this.lockedShares.set({});
    this.pendingReceipts.set([]);
    this.expenseModalOpen.set(true);
  }

  openLightbox(images: string[], index: number, context: 'PENDING' | 'SAVED' = 'SAVED') {
    this.lightboxImages.set(images);
    this.lightboxIndex.set(index);
    this.lightboxContext.set(context);
    setTimeout(() => {
      const container = document.querySelector('.lightbox-scroll') as HTMLElement;
      if (container) {
        container.scrollTo({ left: window.innerWidth * index, behavior: 'instant' });
      }
    }, 10);
  }
  
  openPendingReceiptViewer(index: number) {
    const urls = this.pendingReceipts().map(r => r.url);
    this.openLightbox(urls, index, 'PENDING');
  }

  removeCurrentLightboxImage() {
    const idx = this.lightboxIndex();
    const ctx = this.lightboxContext();
    if (idx === null || ctx !== 'PENDING') return;
    
    // Remove from pendingReceipts
    const arr = [...this.pendingReceipts()];
    arr.splice(idx, 1);
    this.pendingReceipts.set(arr);
    
    // Update lightbox images
    const newUrls = arr.map(r => r.url);
    if (newUrls.length === 0) {
      this.lightboxIndex.set(null);
      this.lightboxImages.set([]);
    } else {
      this.lightboxImages.set(newUrls);
      const nextIdx = Math.min(idx, newUrls.length - 1);
      this.lightboxIndex.set(nextIdx);
    }
  }

  onLightboxScroll(event: Event) {
    const el = event.target as HTMLElement;
    const idx = Math.round(el.scrollLeft / window.innerWidth);
    const imgs = this.lightboxImages();
    if (imgs && idx >= 0 && idx < imgs.length) {
      if (this.lightboxIndex() !== idx) {
        this.lightboxIndex.set(idx);
      }
    }
  }

  openExpenseDetail(exp: Expense) { this.selectedExpense = exp; }

  editExpense(exp: Expense) {
    this.editingExpense = exp;
    this.expForm = { desc: exp.desc, amount: exp.amount, category: exp.category || 'FOOD', payerId: exp.payerId, date: exp.date };
    const inc: Record<string, boolean> = {};
    const lock: Record<string, number | null> = {};
    const trip = this.trip();
    if (trip) {
      if (exp.splits && Object.keys(exp.splits).filter(k => !k.startsWith('__')).length > 0) {
        trip.members.forEach(m => {
          const share = exp.splits![m.id];
          if (share !== undefined && share > 0) {
            inc[m.id] = true;
            // Best effort state reconstruction: keep previous exact values as locked if edited
            lock[m.id] = share;
          } else {
            inc[m.id] = false;
          }
        });
      } else {
        trip.members.forEach(m => inc[m.id] = true);
      }
    }
    this.includedMembers.set(inc);
    this.lockedShares.set(lock);
    this.selectedExpense = null;
    this.selectedExpense = null;
    const urls = exp.receipts || [];
    this.pendingReceipts.set(urls.map(url => ({ url })));
    this.expenseModalOpen.set(true);
  }

  async saveExpense() {
    if (!this.expForm.desc || !this.expForm.amount) return;
    const trip = this.trip();
    if (!trip) return;
    const db = this.supabaseService.client;

    const pending = this.pendingNewMembers().filter(p => this.includedMembers()[p.id]);
    let idMap: Record<string, string> = {};
    if (pending.length > 0) {
      const emailListHtml = pending.map(p => `• <strong>${p.email}</strong>`).join('<br>');
      const msgHtml = `Có <b>${pending.length}</b> người mới vừa được thêm vào chưa nhận được thư mời:<br><br>${emailListHtml}<br><br>Bạn có muốn gửi lời mời cho họ tham gia trip này?`;
      
      const confirmed = await this.confirmService.confirm(
        msgHtml,
        'Mời người mới?',
        'Yes, Invite',
        'Huỷ bỏ'
      );
      if (!confirmed) return;
      
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
        
        const updatedTripMembers = [...trip.members, ...resolvedMembers];
        await db.from('trips').update({ members: updatedTripMembers }).eq('id', trip.id);
        this.travelStore.updateTrip(trip.id, { members: updatedTripMembers });
        
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
    
    try {
      this.currentTripMembersForSplit().forEach(m => {
        if (this.includedMembers()[m.id]) {
          const share = this.calcShare(m.id);
          splits[m.id] = share;
          totalAssigned += share;
          lastMemberId = m.id;
        }
      });

      if (lastMemberId && totalAssigned !== this.expForm.amount) {
         splits[lastMemberId] += (this.expForm.amount - totalAssigned);
      }

      // Inject metadata into splits JSON to avoid altering Supabase schema
      splits['__date'] = this.expForm.date;
      if (this.editingExpense) {
         splits['__isEdited'] = true;
      }

      const payload: any = {
        trip_id: this.tripId(),
        description: this.expForm.desc,
        amount: this.expForm.amount,
        category: this.expForm.category,
        payer_id: this.expForm.payerId,
        splits
      };
      
      // Override created_at only on new inserts
      if (!this.editingExpense && this.expForm.date) {
        try {
          payload.created_at = new Date(this.expForm.date).toISOString();
        } catch(e) {}
      }

      let finalReceiptUrls: string[] = [];
      const currentReceipts = this.pendingReceipts();
      for (const rec of currentReceipts) {
         if (rec.file) {
            const uid = this.currentUserId();
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
        
        // Log action
        this.travelStore.insertActivityLog(
          this.tripId()!,
          'UPDATED_EXPENSE',
          'EXPENSE',
          data['id'],
          data['description'] || 'an expense',
          { amount: data['amount'] }
        );
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

        // Log action
        this.travelStore.insertActivityLog(
          this.tripId()!,
          'CREATED_EXPENSE',
          'EXPENSE',
          data['id'],
          data['description'] || 'an expense',
          { amount: data['amount'] }
        );
      }
      this.expenseModalOpen.set(false);
      this.editingExpense = null;
    } catch (err: any) {
      console.error('Save Expense Error:', err);
      this.toastService.show(err.message || 'Failed to save expense', 'error');
    } finally {
      this.isSavingExpense.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deleteExpenseConfirm(expId: string) {
    const confirmed = await this.confirmService.confirm('Delete this expense?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    // Find the expense before deleting to log it
    const expenseToDelete = this.tripExpenses().find(e => e.id === expId);
    
    // 1. Collect Storage paths before deletion
    const pathsToDelete = (expenseToDelete?.receipts || [])
      .filter(url => url && url.includes('/nomadsync-media/'))
      .map(url => url.split('/nomadsync-media/')[1]);

    // 2. Clear receipt_urls first to bypass Postgres storage triggers (which block DELETE)
    if (pathsToDelete.length > 0) {
      await db.from('expenses').update({ receipt_urls: null }).eq('id', expId);
    }

    const { error } = await db.from('expenses').delete().eq('id', expId);
    if (!error) {
      // 3. Remove orphaned files from Storage bucket
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }

      if (expenseToDelete) {
        this.travelStore.insertActivityLog(
          this.tripId()!,
          'DELETED_EXPENSE',
          'EXPENSE',
          expId,
          expenseToDelete.desc || 'an expense',
          { amount: expenseToDelete.amount }
        );
      }
      this.travelStore.removeExpense(expId);
      this.selectedExpense = null;
    }
  }

  // ─── Members ──────────────────────────────────────────────────────────────
  openAddMemberModal() {
    this.newMemberName = '';
    this.newMemberEmail = '';
    this.inviteStatus.set('');
    this.addMemberOpen.set(true);
  }

  async inviteMember() {
    const name = this.newMemberName.trim();
    let email = this.newMemberEmail.trim();

    if (!name) { this.setInviteError('Please enter the member\'s name.'); return; }
    if (email && !email.includes('@')) { this.setInviteError('Please enter a valid email address.'); return; }

    this.isInviting.set(true);
    this.inviteStatus.set('');
    this.travelStore.setGlobalLoading(true);

    const db = this.supabaseService.client;
    const trip = this.trip();
    if (!trip) { this.isInviting.set(false); return; }

    try {
      let userId: string | null = null;
      let userAvatar: string | undefined = undefined;

      if (email) {
        // 1. Try to find user by email in `users` table
        const { data: userData } = await db.from('users').select('id, name, avatar_url').eq('email', email).maybeSingle();
        if (userData) {
          userId = userData['id'];
          if (userData['avatar_url']) userAvatar = userData['avatar_url'];
        }

        // 2. Try Edge Function
        if (!userId) {
          try {
            const { data: fnData, error: fnErr } = await db.functions.invoke('invite-member', { body: { email } });
            if (fnErr) throw fnErr;
            if (fnData?.userId) userId = fnData.userId;
          } catch (e: any) {
            console.warn('Invite edge function failed:', e);
            this.travelStore.setGlobalLoading(false); // temp hide loading for modal
            const confirmed = await this.confirmService.confirm(
              'Hệ thống gửi thư mời đang bị nghẽn! Thư mời bị chặn.<br><br>Bạn có muốn thêm người này dưới dạng <b>OFFLINE GUEST</b> (Chỉ có Tên, không có Email) để tính toán chia tiền trước không?',
              'Lỗi Gửi Email', 'Thêm Offline Guest', 'Huỷ bỏ'
            );
            this.travelStore.setGlobalLoading(true);
            
            if (confirmed) {
              email = ''; // Xoá email đi để app nhận diện chuẩn là GUEST
            } else {
              this.isInviting.set(false);
              this.travelStore.setGlobalLoading(false);
              return; // Huỷ ngang
            }
          }
        }
      }

      // 3. Build member object
      const finalId = userId || window.crypto.randomUUID();
      const alreadyMember = trip.members.some(m => m.id === finalId || (email && m.email === email));

      if (alreadyMember) {
        this.setInviteError('This person is already a member of the trip.');
        return;
      }

      const newMember: Member = {
        id: finalId,
        name,
        nickname: name,
        email: email || undefined,
        avatar: userAvatar,
        isMe: false
      };


      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }
      const updatedMembers = [...dbMembers, newMember];

      // 4. Update Supabase trip record
      const { error } = await db
        .from('trips')
        .update({ members: updatedMembers })
        .eq('id', trip.id);

      if (error) throw error;

      // 5. Update local store
      this.travelStore.updateTrip(trip.id, { members: updatedMembers });

      // Log action
      this.travelStore.insertActivityLog(
        trip.id,
        'INVITED_MEMBER',
        'MEMBER',
        finalId,
        newMember.name
      );

      // 6. Success
      this.inviteSuccess.set(true);
      this.inviteStatus.set(`✅ ${name} has been added to the trip!`);
      this.newMemberName = '';
      this.newMemberEmail = '';

      // Close after short delay
      setTimeout(() => {
        this.addMemberOpen.set(false);
        this.inviteStatus.set('');
        this.travelStore.refreshData(); // Lấy lại list hiển thị
      }, 1500);
    } catch (err: any) {
      this.setInviteError(err.message || 'Failed to add member. Please try again.');
    } finally {
      this.isInviting.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  private setInviteError(msg: string) {
    this.inviteSuccess.set(false);
    this.inviteStatus.set(msg);
  }

  // ─── Edit Member ──────────────────────────────────────────────────────────
  openEditMember(member: Member) {
    this.editingMember = member;
    this.editMemberName = member.name || '';
    this.editMemberEmail = member.email || '';
    this.editMemberOpen.set(true);
  }

  async saveEditMember() {
    const name = this.editMemberName.trim();
    const email = this.editMemberEmail.trim();

    if (!name || !this.editingMember) return;
    this.isSavingMember.set(true);
    this.travelStore.setGlobalLoading(true);

    const trip = this.trip();
    if (!trip) return;

    try {
      const db = this.supabaseService.client;
      
      // Merge Ghost User Migration Logic
      let newUserId = this.editingMember.id;
      let newAvatar = this.editingMember.avatar;
      
      if (email && email !== this.editingMember.email) {
          const { data: userData } = await db.from('users').select('id, avatar_url').eq('email', email).maybeSingle();
          if (userData) {
             newUserId = userData['id'];
             if (userData['avatar_url']) newAvatar = userData['avatar_url'];
          } else {
             try {
                const { data: fnData, error: fnErr } = await db.functions.invoke('invite-member', { body: { email } });
                if (fnErr) throw fnErr;
                if (fnData?.userId) newUserId = fnData.userId;
             } catch (e: any) {
                console.warn('Re-invite fail:', e);
                this.toastService.show('Gửi thư nối tài khoản thất bại (Nghẽn mạng). Vui lòng thử lại sau 1 tiếng!', 'error');
                this.isSavingMember.set(false);
                this.travelStore.setGlobalLoading(false);
                return; // Huỷ không cho lưu thông tin mập mờ vào DB
             }
          }
          
          if (newUserId && newUserId !== this.editingMember.id) {
             await db.rpc('merge_ghost_user', {
                p_trip_id: trip.id,
                p_ghost_id: this.editingMember.id,
                p_real_user_id: newUserId,
                p_real_name: name,
                p_real_avatar: newAvatar,
                p_real_email: email
             });
             await this.travelStore.refreshData(); // Lấy data mới ngay lập tức
             this.toastService.show('Account merged successfully!', 'success');
             this.editMemberOpen.set(false);
             this.editingMember = null;
             return;
          }
      }

      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }

      const updatedMember: Member = { ...this.editingMember, id: newUserId, name, nickname: name, email: email || undefined, avatar: newAvatar };
      const newMembers = dbMembers.map(m => m.id === this.editingMember!.id ? updatedMember : m);

      const { error } = await db.from('trips').update({ members: newMembers }).eq('id', trip.id);
      if (error) throw error;

      this.travelStore.updateTrip(trip.id, { members: newMembers });
      
      this.travelStore.insertActivityLog(
        trip.id,
        'UPDATED_MEMBER',
        'MEMBER',
        newUserId,
        name
      );

      this.editMemberOpen.set(false);
      this.editingMember = null;
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to update member.', 'error');
    } finally {
      this.isSavingMember.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async removeMember(memberId: string) {
    const confirmed = await this.confirmService.confirm('Remove this member?');
    if (!confirmed) return;
    const trip = this.trip();
    if (!trip) return;
    const db = this.supabaseService.client;

    // Fetch latest members to prevent race condition
    const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
    let dbMembers = trip.members;
    if (freshTrip && freshTrip.members) {
       let raw = freshTrip.members;
       if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
       if (Array.isArray(raw)) dbMembers = raw;
    }

    const updated = dbMembers.filter((m: any) => m.id !== memberId);
    const removedMember = dbMembers.find((m: any) => m.id === memberId);
    await db.from('trips').update({ members: updated }).eq('id', trip.id);
    this.travelStore.updateTrip(trip.id, { members: updated });

    if (removedMember) {
      this.travelStore.insertActivityLog(
        trip.id,
        'REMOVED_MEMBER',
        'MEMBER',
        memberId,
        removedMember.name
      );
    }
  }

  // ─── Delete Trip ───────────────────────────────────────────────────────────
  async confirmDelete() {
    const confirmed = await this.confirmService.confirm('Delete this adventure permanently? This cannot be undone.');
    if (!confirmed) return;
    try {
      // Delegates to TravelStore.deleteTrip() which handles full Storage GC:
      // 1. Collect all media URLs (cover + expense receipts + post images)
      // 2. Clear image_urls/receipt_urls/cover_image before delete (bypass triggers)
      // 3. Delete trip row
      // 4. Remove orphaned files from 'nomadsync-media' bucket
      // 5. Remove cascaded expenses+posts from local signals
      await this.travelStore.deleteTrip(this.tripId());
      this.router.navigate(['/trips']);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete trip. Please try again.', 'error');
    }
  }

  async publishTrip() {
    const isCurrentlyPrivate = this.trip()?.isPrivate ?? true;
    const actionText = isCurrentlyPrivate ? 'publish' : 'unpublish';
    const confirmMessage = isCurrentlyPrivate 
      ? 'Are you sure you want to publish this trip to the Discover feed?'
      : 'Are you sure you want to hide this trip from the Discover feed?';

    const confirmed = await this.confirmService.confirm(confirmMessage);
    if (!confirmed) return;
    
    this.travelStore.setGlobalLoading(true);
    
    try {
      const db = this.supabaseService.client;
      const { error } = await db
        .from('trips')
        .update({ is_private: !isCurrentlyPrivate })
        .eq('id', this.tripId());

      if (error) throw error;
      
      this.travelStore.updateTrip(this.tripId(), { isPrivate: !isCurrentlyPrivate });
      
      // Broadcast to other devices to bypass RLS missing-event bug
      this.travelStore.broadcastRefresh();
      
      if (isCurrentlyPrivate) {
        this.toastService.show('Your amazing adventure is now live on the Discover feed! 🌍', 'success');
      } else {
        this.toastService.show('Trip has been hidden from the Discover feed.', 'success');
      }
    } catch (err: any) {
      this.toastService.show(err.message || `Failed to ${actionText} trip.`, 'error');
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  exportExcel() {
    const trip = this.trip();
    if (!trip) return;
    const members = trip.members;

    const wb = XLSX.utils.book_new();

    // --- SHEET 1: SUMMARY ---
    const summaryData = [
      ['THÔNG TIN DỰ ÁN (TRIP SUMMARY)'],
      ['Tên chuyến đi', trip.title],
      ['Thời gian', `${this.formatDate(trip.startDate)} - ${this.formatDate(trip.endDate)}`],
      ['Tổng số thành viên', members.length],
      ['Tổng chi phí chuyến đi', this.totalTripCost()],
      ['Tổng số hóa đơn', this.tripExpenses().length]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Helper for safely getting share
    const getShare = (mId: string, e: Expense) => {
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
        return e.splits[mId] || 0;
      }
      return this.getFallbackSplit(e);
    };

    // --- SHEET 2: CHI_TIẾT CÁ NHÂN ---
    const chiTietData: any[] = [];
    chiTietData.push(['Tên người tham gia', 'Tên khoản chi', 'Ngày', 'Người thanh toán (Paid By)', 'Số tiền chịu (Share)']);
    members.forEach(m => {
      this.tripExpenses().forEach(e => {
         const share = getShare(m.id, e);
         if (share > 0) {
           chiTietData.push([m.name, e.desc, this.formatDate(e.date), this.getPayerName(e.payerId), share]);
         }
      });
    });
    const wsChiTiet = XLSX.utils.aoa_to_sheet(chiTietData);
    XLSX.utils.book_append_sheet(wb, wsChiTiet, 'Chi Tiết Cá Nhân');

    // --- SHEET 3: DANH SÁCH HÓA ĐƠN ---
    const hoaDonData: any[] = [];
    hoaDonData.push(['Tên khoản chi', 'Ngày', 'Danh mục', 'Người thanh toán (Paid By)', 'Tổng tiền', 'Kiểu chia', 'Chi tiết chia định mức']);
    this.tripExpenses().forEach(e => {
      const participantsDetail: string[] = [];
      let isEven = true;
      
      members.forEach(m => {
        const share = getShare(m.id, e);
        if (share > 0) {
           participantsDetail.push(`${m.name} (${this.formatNumber(share)}đ)`);
        }
      });
      
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
         const amtValues = Object.values(e.splits).filter(v => typeof v === 'number' && v > 0);
         if (amtValues.length > 0) {
           const max = Math.max(...amtValues);
           const min = Math.min(...amtValues);
           if (max - min > 50) isEven = false;
         }
      }
      
      const splitType = isEven ? 'Chia đều' : 'Chia tùy chỉnh';
      hoaDonData.push([e.desc, this.formatDate(e.date), this.getCategoryLabel(e.category||'OTHER'), this.getPayerName(e.payerId), e.amount, splitType, participantsDetail.join('; ')]);
    });
    const wsHoaDon = XLSX.utils.aoa_to_sheet(hoaDonData);
    XLSX.utils.book_append_sheet(wb, wsHoaDon, 'Danh Sách Hóa Đơn');

    // --- SHEET 4: TỔNG KẾT TÀI CHÍNH ---
    const overallData: any[] = [];
    overallData.push(['Tên người tham gia', 'Tổng đã chi (Paid)', 'Tổng thực tiêu (Share)', 'Thừa / Thiếu (Balance)', 'Chi tiết Thanh toán']);
    const debtsList = this.debts();
    members.forEach(m => {
       const totalPaid = this.tripExpenses().filter(e => e.payerId === m.id).reduce((sum, e) => sum + e.amount, 0);
       const totalShare = this.tripExpenses().reduce((sum, e) => {
          return sum + getShare(m.id, e);
       }, 0);
       const balance = totalPaid - totalShare;
       
       const memberDebts = debtsList.filter(d => d.fromId === m.id);
       const memberCredits = debtsList.filter(d => d.toId === m.id);
       
       const debtStrings: string[] = [];
       memberDebts.forEach(d => debtStrings.push(`Thiếu trả cho ${d.toName}: ${this.formatNumber(d.amount)}đ`));
       memberCredits.forEach(c => debtStrings.push(`Nhận lại từ ${c.fromName}: ${this.formatNumber(c.amount)}đ`));
       if (debtStrings.length === 0 && balance === 0) debtStrings.push('Vừa vặn (Không nợ)');
       
       overallData.push([m.name, totalPaid, totalShare, balance, debtStrings.join(' | ')]);
    });
    const wsOverall = XLSX.utils.aoa_to_sheet(overallData);
    XLSX.utils.book_append_sheet(wb, wsOverall, 'Tổng Kết Tài Chính');

    // Tải file về thiết bị
    XLSX.writeFile(wb, `${trip.title}_Financial_Report.xlsx`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getPayerName(payerId: string): string {
    return this.trip()?.members.find(m => m.id === payerId)?.name || 'Someone';
  }

  getCategoryEmoji(cat: string): string { return CATEGORY_META[cat]?.emoji || '💸'; }
  getCategoryLabel(cat: string): string { return CATEGORY_META[cat]?.label || 'Other'; }
  getCategoryBg(cat: string): string    { return CATEGORY_META[cat]?.bg    || '#F3F4F6'; }

  getFallbackSplit(exp: Expense): number {
    const membersCount = this.trip()?.members.length || 1;
    return Math.round(exp.amount / membersCount);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatDateShort(dateStr: string): string {
    if (!dateStr || dateStr === 'Unknown Date') return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  formatRelative(ts: string): string {
    if (!ts) return '';
    try {
      const diff = Date.now() - new Date(ts).getTime();
      if (isNaN(diff)) return '';
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch {
      return '';
    }
  }

  formatCurrency(val: number): string { 
    if (val === null || val === undefined) return '0₫';
    return `${(val || 0).toLocaleString('en-US')}₫`; 
  }
  
  formatNumber(val: number): string   { 
    if (val === null || val === undefined) return '0';
    return (val || 0).toLocaleString('en-US'); 
  }

  getAvatarBg(name: string): string {
    if (!name) return '#F3F4F6';
    const colors = ['#FEE2E2', '#FFEDD5', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#E0E7FF', '#EDE9FE', '#FCE7F3'];
    return colors[name.charCodeAt(0) % colors.length];
  }

  getAvatarColor(name: string): string {
    if (!name) return '#6B7280';
    const colors = ['#DC2626', '#EA580C', '#D97706', '#059669', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777'];
    return colors[name.charCodeAt(0) % colors.length];
  }
}
