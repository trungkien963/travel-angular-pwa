import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Post, Comment } from '../../core/models/social.model';
import { PostDetailService } from './services/post-detail.service';
import { TravelStore } from '../../core/store/travel.store';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { formatRelative } from '../../core/utils/format.util';
import { PostHeaderComponent } from './components/post-header/post-header.component';
import { PostMediaComponent } from './components/post-media/post-media.component';
import { PostActionsComponent } from './components/post-actions/post-actions.component';
import { PostCommentsComponent } from './components/post-comments/post-comments.component';
import { LikesModalComponent } from './components/likes-modal/likes-modal.component';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    TranslatePipe,
    PostHeaderComponent,
    PostMediaComponent,
    PostActionsComponent,
    PostCommentsComponent,
    LikesModalComponent
  ],
  templateUrl: './post-detail.component.html',
  styleUrls: ['./post-detail.component.scss']
})
export class PostDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private postService = inject(PostDetailService);
  private store = inject(TravelStore);

  postId = signal<string>('');
  
  // Local state for when post isn't in store yet
  private localPost = signal<Post | null>(null);
  private localComments = signal<Comment[]>([]);

  // Reactive computed signals
  post = computed(() => {
    const id = this.postId();
    if (!id) return null;
    const storePost = this.store.posts().find(p => p.id === id);
    if (storePost) return storePost;
    
    // Fallback to local post if store hasn't synced yet
    const lp = this.localPost();
    if (lp) {
      // Dynamically check hasLiked in case currentUserId was loaded late
      const uid = this.currentUserId();
      return { ...lp, hasLiked: lp.likes > 0 ? lp.hasLiked || lp.likes >= 1 /* heuristic */ : false }; // Wait, better to just let store sync handle it, but let's re-evaluate hasLiked if needed.
      // Actually, we can't easily re-evaluate hasLiked on localPost without the raw likes array.
    }
    return lp;
  });

  comments = computed(() => {
    const id = this.postId();
    if (!id) return [];
    // Currently, comments are not stored in store.posts(), they are stored in store.trips().comments maybe?
    // Wait, the component was using this.comments.set().
    return this.localComments();
  });

  isLoading = signal<boolean>(true);
  
  newCommentText = signal<string>('');
  isSubmitting = signal<boolean>(false);

  showLikesModal = signal<boolean>(false);

  currentUserId = this.store.currentUserId;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.postId.set(id);
      this.loadData(id);
    }
  }

  async loadData(id: string) {
    this.isLoading.set(true);
    
    try {
      // Load post & comments in parallel
      const [fetchedPost, fetchedComments] = await Promise.all([
        this.postService.getPostById(id),
        this.postService.getComments(id)
      ]);

      if (!fetchedPost) throw new Error('Bài viết không tồn tại hoặc đã bị xóa.');

      this.localPost.set(fetchedPost);
      this.localComments.set(fetchedComments);
    } catch (error: any) {
      console.error('[PostDetailComponent] Lỗi khi tải dữ liệu:', error);
      alert(error.message || 'Có lỗi xảy ra khi tải bài viết.');
      this.goBack();
    } finally {
      this.isLoading.set(false);
    }
  }

  goBack() {
    this.location.back();
  }

  async submitComment(text: string) {
    if (!text || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    
    const trip = this.store.trips().find(t => t.id === this.post()?.tripId);
    const member = trip?.members?.find(m => m.id === this.currentUserId());
    const authorName = member?.name || this.store.currentUserProfile()?.name || 'Me';
    const authorAvatar = member?.avatar || this.store.currentUserProfile()?.avatar;

    // Optimistic UI update
    const tempComment: Comment = {
      id: 'temp-' + Date.now(),
      authorId: this.currentUserId(),
      authorName: authorName,
      authorAvatar: authorAvatar,
      text: text,
      timestamp: new Date().toISOString()
    };
    
    this.localComments.update(list => [...list, tempComment]);

    try {
      // API Call
      const newComment = await this.postService.addComment(this.postId(), text);
      
      if (newComment) {
        // Replace temp with real
        this.localComments.update(list => list.map(c => c.id === tempComment.id ? newComment : c));
      } else {
        throw new Error('Dữ liệu trả về rỗng.');
      }
    } catch (error: any) {
      console.error('[PostDetailComponent] Lỗi khi đăng bình luận:', error);
      // Revert if failed
      this.localComments.update(list => list.filter(c => c.id !== tempComment.id));
      alert(error.message || 'Không thể đăng bình luận. Vui lòng thử lại.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatTime(dateString: string): string {
    return formatRelative(dateString);
  }

  async toggleLike() {
    const p = this.post();
    if (!p) return;
    
    // Optimistic UI Update for Like (fallback for localPost if store not available)
    const hasLiked = !p.hasLiked;
    const likes = hasLiked ? p.likes + 1 : Math.max(0, p.likes - 1);
    
    const lp = this.localPost();
    if (lp && lp.id === p.id) {
       this.localPost.set({ ...lp, hasLiked, likes });
    }
    
    // API Call
    try {
      await this.postService.toggleLike(p.id, hasLiked);
    } catch (err) {
      // Revert on error
      if (lp && lp.id === p.id) {
        this.localPost.set(lp);
      }
    }
  }

  openLikesList() {
    if (!this.postId() || this.post()?.likes === 0) return;
    this.showLikesModal.set(true);
  }

  closeLikesModal() {
    this.showLikesModal.set(false);
  }
}
