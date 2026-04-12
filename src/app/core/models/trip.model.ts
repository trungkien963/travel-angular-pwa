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
}
