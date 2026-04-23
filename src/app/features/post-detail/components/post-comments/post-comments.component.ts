import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Comment } from '../../../../core/models/social.model';
import { formatRelative } from '../../../../core/utils/format.util';

@Component({
  selector: 'app-post-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <!-- Comments List -->
    <div class="comments-section">
      <h3 class="comments-title">{{ 'comment.comments' | translate }} ({{ comments.length }})</h3>
      
      <div class="comment-list">
        <div class="comment-item" *ngFor="let c of comments">
          <div class="avatar" [style.background]="!c.authorAvatar ? getAvatarBg(c.authorName || '?') : ''">
            <img *ngIf="c.authorAvatar" [src]="c.authorAvatar" />
            <span *ngIf="!c.authorAvatar" [style.color]="getAvatarColor(c.authorName || '?')">
              {{ (c.authorName || '?').charAt(0).toUpperCase() }}
            </span>
          </div>
          <div class="comment-content">
            <div class="comment-header">
              <span class="comment-author">{{ c.authorName }}</span>
              <span class="comment-time">{{ formatTime(c.timestamp) }}</span>
            </div>
            <p class="comment-text">{{ c.text }}</p>
          </div>
        </div>
        
        <div *ngIf="comments.length === 0" class="empty-comments">
          {{ 'comment.empty' | translate }}
        </div>
      </div>
    </div>

    <!-- COMMENT INPUT (Sticky Bottom) -->
    <div class="comment-input-area">
      <input type="text" 
             [placeholder]="'comment.write' | translate" 
             [ngModel]="newCommentText()" 
             (ngModelChange)="newCommentText.set($event)"
             (keyup.enter)="onSubmit()"
             [disabled]="isSubmitting">
      <button class="btn-post" 
              [class.active]="newCommentText().trim().length > 0" 
              [disabled]="newCommentText().trim().length === 0 || isSubmitting"
              (click)="onSubmit()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  `,
  styleUrls: ['../../post-detail.component.scss']
})
export class PostCommentsComponent {
  @Input() comments: Comment[] = [];
  @Input() isSubmitting: boolean = false;
  
  @Output() onSubmitComment = new EventEmitter<string>();

  newCommentText = signal<string>('');

  onSubmit() {
    const text = this.newCommentText().trim();
    if (text && !this.isSubmitting) {
      this.onSubmitComment.emit(text);
      this.newCommentText.set('');
    }
  }

  formatTime(dateString: string): string {
    return formatRelative(dateString);
  }

  getAvatarBg(name: string): string {
    const colors = ['#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#F3E8FF', '#FFE4E6'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  }

  getAvatarColor(name: string): string {
    const colors = ['#DC2626', '#D97706', '#059669', '#2563EB', '#9333EA', '#E11D48'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  }
}
// Force rebuild to apply SCSS updates
