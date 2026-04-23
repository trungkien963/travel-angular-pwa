import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Post, Comment } from '../../../../../core/models/social.model';
import { Member } from '../../../../../core/models/expense.model';
import { getAvatarBg, getAvatarColor } from '../../../../../core/utils/avatar.util';
import { formatRelative } from '../../../../../core/utils/format.util';

@Component({
  selector: 'app-post-comments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SwipeToCloseDirective],
  templateUrl: './post-comments-modal.html',
  styleUrl: './post-comments-modal.scss'
})
export class PostCommentsModalComponent {
  @Input({ required: true }) post!: Post;
  @Input() isMember = false;
  @Input() tripMembers: Member[] = [];
  @Output() onClose = new EventEmitter<void>();

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);

  commentText = '';
  readonly isSendingComment = signal(false);

  closeComments() {
    this.onClose.emit();
  }

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;
  formatRelative = formatRelative;

  async sendComment() {
    const text = this.commentText.trim();
    if (!text || !this.post) return;
    
    this.isSendingComment.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const uid = this.travelStore.currentUserId();
      const profile = this.travelStore.currentUserProfile();
      const member = this.tripMembers.find(m => m.id === uid);
      const authorName = profile?.name || member?.name || 'Traveler';

      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: uid,
        authorName,
        authorAvatar: profile?.avatar || undefined,
        text,
        timestamp: new Date().toISOString()
      };

      const existingComments = this.post.comments || [];
      const updatedComments = [...existingComments, newComment];

      // Optimistic local state update
      this.travelStore.updatePost(this.post.id, { comments: updatedComments });
      this.commentText = '';

      // Update Supabase using RPC to avoid race conditions on JSONB arrays
      const db = this.supabaseService.client;
      const { error } = await db.rpc('add_post_comment', {
        p_post_id: this.post.id,
        p_comment: newComment
      });
      
      if (error) {
        // Fallback to traditional update if RPC is not available in the database yet
        console.warn('RPC failed, falling back to full array replace:', error);

        // Fetch the absolute latest `comments` array from the database just before we flush to avoid overwriting someone else's concurrent comment.
        const { data: freshPost } = await db.from('posts').select('comments').eq('id', this.post.id).single();
        
        let freshComments = [];
        if (freshPost) {
          const raw = freshPost['comments'];
          if (Array.isArray(raw)) {
            freshComments = raw;
          } else if (typeof raw === 'string') {
            try { freshComments = JSON.parse(raw); } catch (e) { freshComments = []; }
          }
        }
        
        const safelyMergedComments = [...freshComments, newComment];
        await db.from('posts').update({ comments: safelyMergedComments }).eq('id', this.post.id);
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to send comment.', 'error');
    } finally {
      this.isSendingComment.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
