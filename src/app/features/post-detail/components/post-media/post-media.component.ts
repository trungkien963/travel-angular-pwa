import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LongPressDirective } from '../../../../shared/directives/long-press.directive';
import { ImageExportService } from '../../../../shared/services/image-export.service';

@Component({
  selector: 'app-post-media',
  standalone: true,
  imports: [CommonModule, LongPressDirective],
  template: `
    <div class="media-container" *ngIf="images && images.length" (click)="onImageTap($event)">
      <div class="carousel" [class.dual]="isDual" (scroll)="onScroll($event)">
        <img *ngFor="let img of images" [src]="img" loading="lazy" appLongPress (longPress)="onLongPress(img)" crossorigin="anonymous" />
      </div>

      <div class="pop-heart-overlay" *ngIf="showHeartOverlay">
        <svg fill="#FFC800" viewBox="0 0 24 24" style="filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.4)); width: 120px; height: 120px;">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </div>

      <!-- Indicators for multiple images -->
      <ng-container *ngIf="images.length > 1 && !isDual">
        <div class="carousel-badge">
          {{ activeIndex + 1 }}/{{ images.length }}
        </div>
        <div class="carousel-dots">
          <div class="dot" *ngFor="let img of images; let i = index" [class.active]="i === activeIndex"></div>
        </div>
      </ng-container>
    </div>
  `,
  styleUrls: ['../../post-detail.component.scss']
})
export class PostMediaComponent {
  @Input() images: string[] = [];
  @Input() isDual: boolean = false;
  @Output() onDoubleTap = new EventEmitter<void>();

  isExporting = false;

  constructor(private imageExportService: ImageExportService) {}

  activeIndex = 0;
  showHeartOverlay = false;

  private lastTap = 0;
  private tapTimeout: any;

  onScroll(event: Event) {
    const target = event.target as HTMLElement;
    const scrollLeft = target.scrollLeft;
    const width = target.clientWidth;
    this.activeIndex = Math.round(scrollLeft / width);
  }

  onImageTap(event: Event) {
    const now = Date.now();
    if (now - this.lastTap > 0 && now - this.lastTap < 300) {
      // Double tap detected
      clearTimeout(this.tapTimeout);
      this.lastTap = 0;
      this.handleDoubleTap(event);
    } else {
      this.lastTap = now;
      this.tapTimeout = setTimeout(() => {
        this.lastTap = 0;
      }, 300);
    }
  }

  handleDoubleTap(event: Event) {
    event.preventDefault();
    this.onDoubleTap.emit();
    this.showHeartOverlay = true;
    setTimeout(() => {
      this.showHeartOverlay = false;
    }, 850);
  }

  async onLongPress(imgUrl: string) {
    if (this.isExporting) return;
    this.isExporting = true;
    try {
      await this.imageExportService.exportPolaroid(imgUrl);
    } catch (e) {
      console.error('Export image failed', e);
    } finally {
      this.isExporting = false;
    }
  }
}
