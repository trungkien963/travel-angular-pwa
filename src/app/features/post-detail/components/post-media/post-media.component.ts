import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-post-media',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="media-container" *ngIf="images && images.length">
      <div class="carousel" [class.dual]="isDual" (scroll)="onScroll($event)">
        <img *ngFor="let img of images" [src]="img" loading="lazy" />
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

  activeIndex = 0;

  onScroll(event: Event) {
    const target = event.target as HTMLElement;
    const scrollLeft = target.scrollLeft;
    const width = target.clientWidth;
    this.activeIndex = Math.round(scrollLeft / width);
  }
}
