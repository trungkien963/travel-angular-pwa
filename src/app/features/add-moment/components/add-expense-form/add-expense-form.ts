import { Component, Input, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { CalculatorInputComponent } from '../../../../shared/components/calculator-input/calculator-input.component';

export interface ExpenseFormData {
  amount: number;
  paidById: string;
  category: string;
  receipts: any[];
  splits: Record<string, number>;
  isValid: boolean;
  hasPendingEmailInput?: boolean;
}

@Component({
  selector: 'app-add-expense-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, CalculatorInputComponent],
  templateUrl: './add-expense-form.html',
  styleUrl: './add-expense-form.scss'
})
export class AddExpenseFormComponent {
  @Input({ required: true }) members: any[] = [];
  @Input({ required: true }) currentUserId: string = '';
  
  @Output() onQuickInvite = new EventEmitter<string>();
  @Output() onOpenReceiptViewer = new EventEmitter<{urls: string[], index: number}>();
  @Output() onFormChange = new EventEmitter<ExpenseFormData>();
  @Output() onMemberRemove = new EventEmitter<string>();

  expenseAmount = 0;
  readonly paidById = signal('');
  showPayerList = false;
  
  readonly includedMembers = signal<Record<string, boolean>>({});
  readonly lockedShares = signal<Record<string, number | null>>({});
  
  readonly expenseCategories = [
    { id: 'FOOD', icon: '🍔', label: 'Food' },
    { id: 'TRANSPORT', icon: '🚕', label: 'Transport' },
    { id: 'HOTEL', icon: '🏨', label: 'Hotel' },
    { id: 'ACTIVITIES', icon: '🎯', label: 'Activities' },
    { id: 'SHOPPING', icon: '🛍️', label: 'Shopping' },
    { id: 'OTHER', icon: '💳', label: 'Other' }
  ];
  readonly selectedCategory = signal('FOOD');
  readonly pendingReceipts = signal<any[]>([]);

  newMemberEmail = '';

  readonly activeMemberCount = computed(() => {
    const inc = this.includedMembers();
    return Object.values(inc).filter(v => v).length;
  });

  ngOnInit() {
    if (!this.paidById()) {
      this.paidById.set(this.currentUserId);
    }
  }

  ngOnChanges() {
    // Make sure new members are included by default
    this.includedMembers.update(inc => {
      const updated = { ...inc };
      let changed = false;
      this.members.forEach(m => {
        if (updated[m.id] === undefined) {
          updated[m.id] = true;
          changed = true;
        }
      });
      return changed ? updated : inc;
    });
    this.emitFormChange();
  }

  getPayerNameLocal(id: string) {
    if (id === this.currentUserId) return 'You';
    const m = this.members.find(x => x.id === id);
    return m ? m.name : 'Unknown';
  }

  onTotalAmountChange(val: number | null) {
    this.expenseAmount = val || 0;
    this.emitFormChange();
  }

  toggleMember(id: string) {
    this.includedMembers.update(m => ({ ...m, [id]: !m[id] }));
    if (!this.includedMembers()[id]) {
       this.lockedShares.update(m => ({ ...m, [id]: null })); 
       this.onMemberRemove.emit(id);
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
    this.emitFormChange();
  }

  selectAllForSplit() {
    const inc: Record<string, boolean> = {};
    this.members.forEach(m => inc[m.id] = true);
    this.includedMembers.set(inc);
    this.lockedShares.set({});
    this.emitFormChange();
  }

  clearAllForSplit() {
    const inc: Record<string, boolean> = {};
    this.members.forEach(m => inc[m.id] = false);
    this.includedMembers.set(inc);
    this.lockedShares.set({});
    this.emitFormChange();
  }

  setLockedAmountNum(memberId: string, value: number | null) {
    this.lockedShares.update(m => ({ ...m, [memberId]: value }));
    this.updateLockedValue(memberId, value == null ? '' : value.toString());
  }

  onMemberShareCommit(memberId: string, value: number | null) {
    if (value === 0) {
      this.includedMembers.update(m => ({ ...m, [memberId]: false }));
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      this.onMemberRemove.emit(memberId);
      this.updateLockedValue(memberId, '');
    }
  }

  updateLockedValue(memberId: string, value: string) {
    const val = value.trim();
    const inc = this.includedMembers();
    const active = Object.keys(inc).filter(k => inc[k]);

    if (!val || active.length <= 1) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      this.emitFormChange();
      return;
    }
    
    let num = 0;
    if (val.endsWith('%')) {
      const pct = parseFloat(val) / 100;
      num = (this.expenseAmount || 0) * pct;
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
    this.emitFormChange();
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    
    if (this.activeMemberCount() === 1) {
      return this.expenseAmount || 0;
    }

    const lockedAmount = this.lockedShares()[memberId];
    if (lockedAmount !== undefined && lockedAmount !== null) {
      return lockedAmount;
    }

    const total = this.expenseAmount || 0;
    let totalLocked = 0;
    let floatCount = 0;

    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l !== undefined && l !== null) {
          totalLocked += l;
        } else {
          floatCount++;
        }
      }
    });

    let remainder = total - totalLocked;
    return floatCount > 0 ? Math.round(Math.max(0, remainder) / floatCount) : 0;
  }

  isSplitExceedingTotal(): boolean {
    if (this.activeMemberCount() <= 1) return false;
    const total = this.expenseAmount || 0;
    let totalLocked = 0;
    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l != null) totalLocked += l;
      }
    });
    return totalLocked > total;
  }

  quickInviteMember() {
    if (this.newMemberEmail.trim()) {
      this.onQuickInvite.emit(this.newMemberEmail.trim());
      this.newMemberEmail = '';
    }
  }

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const newFiles = Array.from(input.files).map(file => ({
        url: URL.createObjectURL(file),
        file
      }));
      this.pendingReceipts.update(r => [...r, ...newFiles]);
      this.emitFormChange();
    }
    input.value = '';
  }

  removeReceipt(idx: number, event: Event) {
    event.stopPropagation();
    this.pendingReceipts.update(r => {
      const arr = [...r];
      const removed = arr.splice(idx, 1)[0];
      if (removed) URL.revokeObjectURL(removed.url);
      return arr;
    });
    this.emitFormChange();
  }

  openPendingReceiptViewer(index: number) {
    const urls = this.pendingReceipts().map(r => r.url);
    this.onOpenReceiptViewer.emit({urls, index});
  }

  emitFormChange() {
    let splits: Record<string, number> = {};
    if (this.expenseAmount > 0) {
      let totalAssigned = 0;
      let lastMemberId: string | null = null;
      
      this.members.forEach(m => { 
        if (this.includedMembers()[m.id]) {
          const share = this.calcShare(m.id);
          splits[m.id] = share;
          totalAssigned += share;
          lastMemberId = m.id;
        }
      });
      
      if (lastMemberId && totalAssigned !== this.expenseAmount) {
         splits[lastMemberId] += (this.expenseAmount - totalAssigned);
      }
    }

    const isValid = this.expenseAmount > 0 && !!this.paidById() && !this.isSplitExceedingTotal();

    this.onFormChange.emit({
      amount: this.expenseAmount,
      paidById: this.paidById(),
      category: this.selectedCategory(),
      receipts: this.pendingReceipts(),
      splits,
      isValid,
      hasPendingEmailInput: this.newMemberEmail.trim().length > 0
    });
  }
}
