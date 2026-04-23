import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LowerCasePipe } from '@angular/common';
import { Post } from '../../../../core/models/social.model';
import { getAvatarBg, getAvatarColor } from '../../../../core/utils/avatar.util';
import { formatRelative } from '../../../../core/utils/format.util';

@Component({
  selector: 'app-trip-social',
  standalone: true,
  imports: [TranslatePipe, LowerCasePipe],
  templateUrl: './trip-social.html',
  styleUrl: './trip-social.scss',
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

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;
  formatRelative = formatRelative;
}
