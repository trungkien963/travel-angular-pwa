export type NotificationType = 'TRIP_INVITE' | 'EXPENSE_ADDED' | 'POST_COMMENT' | 'POST_NEW' | 'POST_LIKE';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actorName: string;
  actorAvatar?: string;
  message: string;
  tripId?: string;
  postId?: string;
  expenseId?: string;
  createdAt: string;
  isRead: boolean;
}
