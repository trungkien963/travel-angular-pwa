import { Component, signal, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

interface Slide {
  id: string;
  image: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnDestroy {
  constructor(private router: Router) {}

  readonly slides: Slide[] = [
    {
      id: '1',
      image: '/landing/1.jpg',
      title: 'Find Your Perfect Escape',
      description: 'Discover beautiful destinations and breathtaking views recommended just for you.'
    },
    {
      id: '2',
      image: '/landing/2.jpg',
      title: 'Relax and Unwind',
      description: 'Leave the stress behind and dive into a world of ultimate relaxation and luxury.'
    },
    {
      id: '3',
      image: '/landing/3.jpg',
      title: 'Enjoy Every Moment',
      description: 'Create unforgettable memories filled with fun, sunshine, and endless joy.'
    },
    {
      id: '4',
      image: '/landing/4.jpg',
      title: 'Sunny Days Ahead',
      description: 'Bask in the tropical sun and enjoy your much-deserved holiday by the pool.'
    },
    {
      id: '5',
      image: '/landing/5.jpg',
      title: '',
      description: ''
    }
  ];

  readonly currentIndex = signal(0);
  private autoTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  nextSlide() {
    if (this.currentIndex() < this.slides.length - 1) {
      this.currentIndex.update(i => i + 1);
    }
  }

  goToAuth() {
    this.router.navigate(['/auth']);
  }
}
