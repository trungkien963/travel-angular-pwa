export interface Member {
  id: string;
  tripId?: string;
  name: string;
  isMe?: boolean;
  avatar?: string;
  email?: string;
  phone?: string;
}

export interface Expense {
  id: string;
  tripId?: string;
  desc: string;
  amount: number;
  payerId: string;
  date: string;
  splits?: Record<string, number>;
  receipts?: string[];
  receipt?: string;
  createdAt?: string;
  category?: ExpenseCategory;
}

export type ExpenseCategory = 'FOOD' | 'TRANSPORT' | 'HOTEL' | 'ACTIVITIES' | 'SHOPPING' | 'OTHER';

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  FOOD: '#EF4444',
  TRANSPORT: '#3B82F6',
  HOTEL: '#8B5CF6',
  ACTIVITIES: '#10B981',
  SHOPPING: '#EC4899',
  OTHER: '#9CA3AF'
};

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FOOD: '🍜 Food',
  TRANSPORT: '✈️ Transport',
  HOTEL: '🏨 Hotel',
  ACTIVITIES: '🎯 Activities',
  SHOPPING: '🛍️ Shopping',
  OTHER: '💼 Other'
};

export type SplitType = 'EQUALLY' | 'PERCENT' | 'FIXED';
