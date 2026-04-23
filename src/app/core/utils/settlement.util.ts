import { Expense, Member } from '../models/expense.model';
import { Debt } from '../../features/trip-detail/trip-detail.component';

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
