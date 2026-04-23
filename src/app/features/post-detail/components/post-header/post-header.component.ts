import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-post-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="detail-header">
      <button class="btn-icon" (click)="onBack.emit()">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
      
      <div class="header-author">
        <div class="avatar" [style.background]="!authorAvatar ? getAvatarBg(authorName || '?') : ''">
          <img *ngIf="authorAvatar" [src]="authorAvatar" alt="avatar" />
          <span *ngIf="!authorAvatar" [style.color]="getAvatarColor(authorName || '?')">
            {{ (authorName || '?').charAt(0).toUpperCase() }}
          </span>
        </div>
        <div class="author-info">
          <span class="name">{{ authorName }}</span>
          <span class="time">{{ formattedTime }}</span>
        </div>
      </div>
      
      <button class="btn-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1.5"></circle>
          <circle cx="19" cy="12" r="1.5"></circle>
          <circle cx="5" cy="12" r="1.5"></circle>
        </svg>
      </button>
    </header>
  `,
  styleUrls: ['../../post-detail.component.scss'] // We can reuse the main styles or extract them later
})
export class PostHeaderComponent {
  @Input() authorName?: string;
  @Input() authorAvatar?: string;
  @Input() formattedTime!: string;
  
  @Output() onBack = new EventEmitter<void>();

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
