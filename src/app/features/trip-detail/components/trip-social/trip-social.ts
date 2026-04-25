import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { LowerCasePipe } from '@angular/common';
import { Post } from '../../../../core/models/social.model';
import { getAvatarBg, getAvatarColor } from '../../../../core/utils/avatar.util';
import { formatRelative } from '../../../../core/utils/format.util';
import { PostDetailService } from '../../../post-detail/services/post-detail.service';
import { inject } from '@angular/core';
import { ToastService } from '../../../../core/services/toast.service';
import { PhotoViewerService } from '../../../../core/services/photo-viewer.service';

import { LikesModalComponent } from '../../../post-detail/components/likes-modal/likes-modal.component';

@Component({
  selector: 'app-trip-social',
  standalone: true,
  imports: [TranslatePipe, LowerCasePipe, LikesModalComponent],
  templateUrl: './trip-social.html',
  styleUrl: './trip-social.scss',
})
export class TripSocialComponent {
  private postDetailService = inject(PostDetailService);
  private toastService = inject(ToastService);
  private photoViewerService = inject(PhotoViewerService);

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

  // ─── Likes Modal State ───
  readonly likesPostId = signal<string | null>(null);

  openLikesList(postId: string) {
    this.likesPostId.set(postId);
  }

  closeLikesModal() {
    this.likesPostId.set(null);
  }

  private tapTimers = new Map<string, number>();
  private tapTimeouts = new Map<string, any>();

  triggerLike(postId: string, hasLiked: boolean) {
    this.onToggleLike.emit(postId);
    if (navigator.vibrate) {
      navigator.vibrate(!hasLiked ? 15 : 10);
    }
  }

  onImageTap(event: Event, post: Post) {
    const now = Date.now();
    const lastTap = this.tapTimers.get(post.id) || 0;
    
    if (now - lastTap > 0 && now - lastTap < 300) { 
      // Double tap!
      clearTimeout(this.tapTimeouts.get(post.id));
      this.handleDoubleTapAnimation(event, post);
      this.tapTimers.set(post.id, 0); // reset
    } else {
      this.tapTimers.set(post.id, now);
      const timeout = setTimeout(() => {
        this.tapTimers.set(post.id, 0);
        // Single tap action: Open Image Viewer
        const target = event.target as HTMLElement;
        const scrollLeft = target.scrollLeft || 0;
        const clientWidth = target.clientWidth || 1;
        const startIndex = Math.round(scrollLeft / (clientWidth - 32)) || 0;
        
        if (post.images && post.images.length > 0) {
          this.photoViewerService.open(post.images, startIndex);
        }
      }, 300);
      this.tapTimeouts.set(post.id, timeout);
    }
  }

  doubleTapStates = signal<Record<string, boolean>>({});

  handleDoubleTapAnimation(event: Event, post: Post) {
    event.preventDefault();
    
    if (!post.hasLiked) {
      this.triggerLike(post.id, post.hasLiked);
    }
    
    this.doubleTapStates.update(s => ({ ...s, [post.id]: true }));
    
    setTimeout(() => {
      this.doubleTapStates.update(s => ({ ...s, [post.id]: false }));
    }, 850);
  }

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
