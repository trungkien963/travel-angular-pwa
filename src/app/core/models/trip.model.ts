import { Member } from './expense.model';

export interface Trip {
  id: string;
  title: string;
  locationName?: string;
  locationCity?: string;
  coverImage: string;
  startDate: string;
  endDate: string;
  ownerId: string;
  members: Member[];
  isPrivate: boolean;
  likes?: string[];
  comments?: any[];
}

export interface ActivityLog {
  id: string;
  tripId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, any>;
  createdAt: string;
}
