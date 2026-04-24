import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Comment } from '../../../../core/models/social.model';
import { formatRelative } from '../../../../core/utils/format.util';
import { MentionInputComponent, MentionUser } from '../../../../shared/components/mention-input/mention-input.component';

@Component({
  selector: 'app-post-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, MentionInputComponent],
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
            <p class="comment-text" [innerHTML]="formatMention(c.text)"></p>
            <div class="comment-actions">
              <span class="btn-reply" (click)="replyTo(c)">Reply</span>
              @if (currentUserId && c.authorId === currentUserId) {
                <span class="btn-delete" (click)="deleteComment(c.id)">Delete</span>
              }
            </div>
          </div>
        </div>
        
        <div *ngIf="comments.length === 0" class="empty-comments">
          {{ 'comment.empty' | translate }}
        </div>
      </div>
    </div>

    <!-- COMMENT INPUT (Sticky Bottom) -->
    <div class="comment-input-area">
      <app-mention-input
        [value]="newCommentText()"
        (valueChange)="newCommentText.set($event)"
        [disabled]="isSubmitting"
        [candidates]="mentionCandidates"
        (send)="onSubmit()"
      ></app-mention-input>
    </div>
  `,
  styleUrls: ['../../post-detail.component.scss']
})
export class PostCommentsComponent {
  @Input() comments: Comment[] = [];
  @Input() isSubmitting: boolean = false;
  @Input() mentionCandidates: MentionUser[] = [];
  @Input() currentUserId: string | null = null;
  
  @Output() onSubmitComment = new EventEmitter<string>();
  @Output() onDeleteComment = new EventEmitter<string>();

  newCommentText = signal<string>('');

  onSubmit() {
    const text = this.newCommentText().trim();
    if (text && !this.isSubmitting) {
      this.onSubmitComment.emit(text);
      this.newCommentText.set('');
    }
  }

  replyTo(c: Comment) {
    const current = this.newCommentText();
    const formattedName = c.authorName?.replace(/\s+/g, '') || 'User';
    this.newCommentText.set(`${current ? current + ' ' : ''}@${formattedName} `);
  }

  deleteComment(commentId: string) {
    this.onDeleteComment.emit(commentId);
  }

  formatMention(text: string): string {
    if (!text) return '';
    // Basic sanitization
    const div = document.createElement('div');
    div.innerText = text;
    let safeText = div.innerHTML;
    // Highlight mentions
    return safeText.replace(/@([^\s]+)/g, '<strong class="mention-text">@$1</strong>');
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
