import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-post-actions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="action-bar">
      <div class="actions-left">
        <button class="btn-action" [class.active]="hasLiked" (click)="onLike.emit()">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" 
               [attr.fill]="hasLiked ? '#EF4444' : 'none'" 
               [attr.stroke]="hasLiked ? '#EF4444' : 'currentColor'" 
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <button class="btn-action">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
      <button class="btn-action btn-share">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
      </button>
    </div>

    <div class="likes-count" *ngIf="likes > 0">
      <strong>{{ likes }} likes</strong>
    </div>

    <div class="caption-container" *ngIf="content">
      <span class="caption-author">{{ authorName }}</span>
      <span class="caption-text">{{ content }}</span>
    </div>
  `,
  styleUrls: ['../../post-detail.component.scss']
})
export class PostActionsComponent {
  @Input() hasLiked: boolean = false;
  @Input() likes: number = 0;
  @Input() authorName?: string;
  @Input() content?: string;

  @Output() onLike = new EventEmitter<void>();
}
