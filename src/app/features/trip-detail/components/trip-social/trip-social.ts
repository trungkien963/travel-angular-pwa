import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LowerCasePipe } from '@angular/common';
import { Post } from '../../../../core/models/social.model';

@Component({
  selector: 'app-trip-social',
  standalone: true,
  imports: [TranslatePipe, LowerCasePipe],
  templateUrl: './trip-social.html',
  styleUrl: './trip-social.css',
})
export class TripSocialComponent {
  @Input({ required: true }) tripPosts: Post[] = [];
  @Input({ required: true }) currentUserId: string = '';
  @Input({ required: true }) isMember: boolean = false;
  @Input({ required: true }) isOwner: boolean = false;

  @Output() onNavigateToAddMoment = new EventEmitter<void>();
  @Output() onOpenEditPost = new EventEmitter<Post>();
  @Output() onDeletePost = new EventEmitter<string>();
  @Output() onToggleLike = new EventEmitter<string>();
  @Output() onOpenComments = new EventEmitter<Post>();
  @Output() onSharePost = new EventEmitter<Post>();

  readonly activeMenuId = signal<string | null>(null);
  readonly activeImageIndex = signal<Record<string, number>>({});

  toggleMenu(postId: string) {
    this.activeMenuId.update(id => id === postId ? null : postId);
  }

  onImageScroll(postId: string, event: Event) {
    const target = event.target as HTMLElement;
    const scrollLeft = target.scrollLeft;
    const clientWidth = target.clientWidth;
    const index = Math.round(scrollLeft / (clientWidth - 32));
    
    const current = this.activeImageIndex()[postId] || 0;
    if (current !== index) {
      this.activeImageIndex.update(m => ({ ...m, [postId]: index }));
    }
  }

  getActiveImageIndex(postId: string): number {
    return this.activeImageIndex()[postId] || 0;
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

  formatRelative(ts: string): string {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      const diff = Date.now() - date.getTime();
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch {
      return '';
    }
  }
}
