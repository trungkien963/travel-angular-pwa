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
    PostCommentsComponent
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
  post = signal<Post | null>(null);
  comments = signal<Comment[]>([]);
  isLoading = signal<boolean>(true);
  
  newCommentText = signal<string>('');
  isSubmitting = signal<boolean>(false);

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
    
    // Load post & comments in parallel
    const [fetchedPost, fetchedComments] = await Promise.all([
      this.postService.getPostById(id),
      this.postService.getComments(id)
    ]);

    this.post.set(fetchedPost);
    this.comments.set(fetchedComments);
    this.isLoading.set(false);
  }

  goBack() {
    this.location.back();
  }

  async submitComment(text: string) {
    if (!text || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    
    // Optimistic UI update
    const tempComment: Comment = {
      id: 'temp-' + Date.now(),
      authorId: this.currentUserId(),
      authorName: this.store.currentUserProfile()?.name || 'Me',
      authorAvatar: this.store.currentUserProfile()?.avatar,
      text: text,
      timestamp: new Date().toISOString()
    };
    
    this.comments.update(list => [...list, tempComment]);

    // API Call
    const newComment = await this.postService.addComment(this.postId(), text);
    
    if (newComment) {
      // Replace temp with real
      this.comments.update(list => list.map(c => c.id === tempComment.id ? newComment : c));
    } else {
      // Revert if failed
      this.comments.update(list => list.filter(c => c.id !== tempComment.id));
      alert('Failed to post comment. Please try again.');
    }
    
    this.isSubmitting.set(false);
  }

  formatTime(dateString: string): string {
    return formatRelative(dateString);
  }

  toggleLike() {
    const p = this.post();
    if (!p) return;
    
    // Optimistic UI Update for Like
    const hasLiked = !p.hasLiked;
    const likes = hasLiked ? p.likes + 1 : Math.max(0, p.likes - 1);
    this.post.set({ ...p, hasLiked, likes });
    
    // In real app, call API here:
    // this.postService.toggleLike(p.id, hasLiked);
  }
}
