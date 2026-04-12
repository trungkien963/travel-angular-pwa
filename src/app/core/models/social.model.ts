export interface Comment {
  id: string;
  locationName?: string;
  locationCity?: string;
  tripId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timestamp: string;
}

export interface Post {
  id: string;
  locationName?: string;
  locationCity?: string;
  tripId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  images: string[];
  isDual?: boolean;
  timestamp: string;
  date: string;
  likes: number;
  hasLiked: boolean;
  comments: Comment[];
}
