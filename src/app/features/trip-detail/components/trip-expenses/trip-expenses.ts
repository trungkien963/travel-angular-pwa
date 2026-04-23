import { Component, Input, Output, EventEmitter, signal, computed, OnChanges, SimpleChanges } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Expense, Member } from '../../../../core/models/expense.model';
import { CATEGORY_META } from '../../trip-detail.component';
import { formatDateShort, formatCurrency, formatNumber } from '../../../../core/utils/format.util';

@Component({
  selector: 'app-trip-expenses',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './trip-expenses.html',
  styleUrl: './trip-expenses.scss',
})
export class TripExpensesComponent implements OnChanges {
  @Input({ required: true }) tripExpenses: Expense[] = [];
  @Input({ required: true }) members: Member[] = [];
  @Input({ required: true }) currentUserId: string = '';
  @Input({ required: true }) isMember: boolean = false;
  @Input({ required: true }) yourShare: number = 0;
  @Input({ required: true }) totalTripCost: number = 0;

  @Output() onSetTab = new EventEmitter<string>();
  @Output() onOpenExpenseModal = new EventEmitter<void>();
  @Output() onOpenExpenseDetail = new EventEmitter<Expense>();

  readonly activeExpenseFilter = signal<'EXPENSES' | 'MINE' | 'SETTLEMENTS'>('EXPENSES');
  private _refresh = signal(0);

  ngOnChanges(changes: SimpleChanges) {
    this._refresh.update(v => v + 1);
  }

  readonly displayExpenses = computed(() => {
    this._refresh();
    const expenses = this.tripExpenses || [];
    const uid = this.currentUserId;
    const filter = this.activeExpenseFilter();
    
    const mapped = expenses.map(ex => {
      let mySplitAmount = 0;
      let hasSplit = false;
      
      if (ex.splits && Object.keys(ex.splits).filter(k => !k.startsWith('__')).length > 0) {
        if (ex.splits[uid] !== undefined) {
           mySplitAmount = ex.splits[uid] as number;
           hasSplit = true;
        }
      } else {
         const membersCount = this.members.length || 1;
         const isMember = this.members.some(m => m.id === uid);
         if (isMember) {
            mySplitAmount = Math.round(ex.amount / membersCount);
            hasSplit = true;
         }
      }

      const isInvolved = ex.category === 'SETTLEMENT' 
        ? (ex.payerId === uid || mySplitAmount > 0 || ex.splits?.[uid] !== undefined)
        : (ex.payerId === uid || (hasSplit && mySplitAmount > 0));
      
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

    if (filter === 'EXPENSES') {
       return mapped.filter(ex => ex.category !== 'SETTLEMENT');
    }
    if (filter === 'SETTLEMENTS') {
       return mapped.filter(ex => ex.category === 'SETTLEMENT');
    }
    if (filter === 'MINE') {
       return mapped.filter(ex => ex.isInvolved && ex.category !== 'SETTLEMENT');
    }
    
    return mapped;
  });

  readonly displayExpensesGrouped = computed(() => {
     const list = [...this.displayExpenses()].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
           return dateB.localeCompare(dateA); // Sort dates descending
        }
        // Same date, sort by updated time (createdAt) descending
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
     });

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

  // UI Helpers
  getCategoryEmoji(cat: string): string { return CATEGORY_META[cat]?.emoji || '💸'; }
  getCategoryLabel(cat: string): string { return CATEGORY_META[cat]?.label || 'Other'; }
  getCategoryBg(cat: string): string    { return CATEGORY_META[cat]?.bg    || '#F3F4F6'; }

  getPayerName(payerId: string): string {
    return this.members.find(m => m.id === payerId)?.name || 'Someone';
  }

  formatDateShort = formatDateShort;
  formatCurrency = formatCurrency;
  formatNumber = formatNumber;
}
