import { Expense, Member } from '../models/expense.model';
import { Debt } from '../../features/trip-detail/trip-detail.component';
import { CATEGORY_META } from '../../features/trip-detail/trip-detail.component';

export interface RelatedExpenseItem {
  expense: Expense;
  unpaidAmount: number;
  isPartial: boolean;
  cleanDesc: string;
}

export function calculateSettleRelatedExpenses(
  debt: Debt | null,
  tripExpenses: Expense[],
  members: Member[],
  getCategoryLabel: (cat: string) => string
): RelatedExpenseItem[] {
  if (!debt) return [];

  const A = debt.fromId; // Debtor
  const B = debt.toId;   // Creditor

  // Sort chronologically (oldest first)
  const expenses = [...tripExpenses].reverse();

  const type1Expenses: { exp: Expense; originalOwe: number }[] = [];
  let totalOffsets = 0;

  expenses.forEach(exp => {
    const payerId = exp.payerId;
    if (!payerId) return;

    let splits = exp.splits;
    if (!splits || Object.keys(splits).filter(k => !k.startsWith('__')).length === 0) {
      splits = {};
      const share = exp.amount / members.length;
      members.forEach(m => (splits![m.id] = share));
    }

    const shareA = (splits[A] as number) || 0;
    const shareB = (splits[B] as number) || 0;

    if (payerId === B && shareA > 0) {
      type1Expenses.push({ exp, originalOwe: shareA });
    } else if (payerId === A && shareB > 0) {
      totalOffsets += shareB;
    }
  });

  const result: RelatedExpenseItem[] = [];

  type1Expenses.forEach(item => {
    let remain = item.originalOwe;

    let cleanDesc = item.exp.desc || getCategoryLabel(item.exp.category || 'OTHER');
    if (item.exp.category === 'SETTLEMENT' && cleanDesc.startsWith('Payment: ')) {
      cleanDesc = cleanDesc.substring(9).replace(' -> ', ' ➔ ');
    }

    if (totalOffsets >= remain) {
      totalOffsets -= remain;
    } else if (totalOffsets > 0) {
      remain -= totalOffsets;
      totalOffsets = 0;
      result.push({
        expense: item.exp,
        unpaidAmount: Math.round(remain),
        isPartial: true,
        cleanDesc
      });
    } else {
      result.push({
        expense: item.exp,
        unpaidAmount: Math.round(remain),
        isPartial: false,
        cleanDesc
      });
    }
  });

  return result.reverse(); // Newest first
}

export function calculateDebts(expenses: Expense[], members: Member[], currentUserId: string): Debt[] {
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
        fromId: debtor.id, fromName: fromMember?.name || debtor.id, fromAvatar: fromMember?.avatar,
        toId: creditor.id, toName: toMember?.name || creditor.id, toAvatar: toMember?.avatar,
        amount: Math.round(settled)
      });
    }

    debtor.amount -= settled;
    creditor.amount -= settled;

    if (debtor.amount < 1) i++;
    if (creditor.amount < 1) j++;
  }

  result.sort((a, b) => {
    const getRank = (d: Debt) => {
      if (d.toId === currentUserId) return 1; // Current user receives
      if (d.fromId === currentUserId) return 2; // Current user owes
      return 3; // Others
    };
    const rankA = getRank(a);
    const rankB = getRank(b);
    
    if (rankA !== rankB) return rankA - rankB;
    // Secondary sort: amount descending
    return b.amount - a.amount;
  });

  return result;
}

export function calculateChartData(tripExpenses: Expense[]) {
  const totals: Record<string, number> = {};
  let grand = 0;
  tripExpenses.forEach(e => {
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
}

export function calculateYourShare(tripExpenses: Expense[], currentUserId: string, numMembers: number) {
  return tripExpenses.reduce((sum, e) => {
    if (e.category === 'SETTLEMENT') return sum;
    if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
      return sum + (e.splits[currentUserId] || 0);
    }
    return sum + Math.round(e.amount / numMembers);
  }, 0);
}
