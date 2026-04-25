import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Post, Comment } from '../../core/models/social.model';
import { PostDetailService } from './services/post-detail.service';
import { TravelStore } from '../../core/store/travel.store';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { formatRelative } from '../../core/utils/format.util';
import { ConfirmService } from '../../core/services/confirm.service';
import { PostHeaderComponent } from './components/post-header/post-header.component';
import { PostMediaComponent } from './components/post-media/post-media.component';
import { PostActionsComponent } from './components/post-actions/post-actions.component';
import { shareOrDownloadImage } from '../../core/utils/image.util';
import { ToastService } from '../../core/services/toast.service';
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
  private confirmService = inject(ConfirmService);
  private toastService = inject(ToastService);

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
      return { ...lp, hasLiked: lp.likes > 0 ? lp.hasLiked || lp.likes >= 1 : false };
    }
    return lp;
  });

  get mentionCandidates() {
    const p = this.post();
    if (!p || !p.tripId) return [];
    const trip = this.store.trips().find(t => t.id === p.tripId);
    if (!trip || !trip.members) return [];
    return trip.members.map(m => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar
    }));
  }

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

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!this.store.currentUserId()) {
      await this.store.initSupabase();
    }
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
        
        // Update store commentCount for this post
        const currentPost = this.store.posts().find(p => p.id === this.postId());
        if (currentPost) {
          this.store.updatePost(this.postId(), { commentCount: (currentPost.commentCount || 0) + 1 });
        }
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

  async deleteComment(commentId: string) {
    const confirmed = await this.confirmService.confirm('Bạn có chắc chắn muốn xóa bình luận này?', 'Xóa bình luận', 'Xóa', 'Hủy');
    if (!confirmed) return;

    try {
      this.localComments.update(list => list.filter(c => c.id !== commentId));
      await this.postService.deleteComment(commentId);
      
      const currentPost = this.store.posts().find(p => p.id === this.postId());
      if (currentPost && currentPost.commentCount) {
        this.store.updatePost(this.postId(), { commentCount: Math.max(0, currentPost.commentCount - 1) });
      }
    } catch (error: any) {
      console.error('[PostDetailComponent] Lỗi khi xóa bình luận:', error);
      alert(error.message || 'Có lỗi xảy ra khi xóa bình luận.');
      this.loadData(this.postId());
    }
  }

  formatTime(dateString: string): string {
    return formatRelative(dateString);
  }

  handleDoubleTap() {
    const p = this.post();
    if (p && !p.hasLiked) {
      this.toggleLike();
    }
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

  async sharePost() {
    const p = this.post();
    if (!p) return;
    
    const url = window.location.origin + '/trip/' + p.tripId;
    const imageUrl = p.images && p.images.length > 0 ? p.images[0] : '';
    
    this.toastService.show('Đang chuẩn bị ảnh...', 'info');
    const success = await shareOrDownloadImage(
      imageUrl,
      `WanderPool Moment: ${p.authorName}`,
      `${p.content || 'Check out this moment on WanderPool!'}\n\n`,
      url
    );

    if (!success) {
      try {
        await navigator.clipboard.writeText(url);
        this.toastService.show('Link copied to clipboard!', 'success');
      } catch (err) {
        this.toastService.show('Failed to copy link', 'error');
      }
    }
  }
}
