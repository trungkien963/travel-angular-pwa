import { Component, signal, computed, OnInit, inject, input, effect, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Post } from '../../core/models/social.model';
import { Expense } from '../../core/models/expense.model';

interface DayElement {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isInTrip: boolean;
  isTripStart: boolean;
  isTripEnd: boolean;
  tripId?: string;
  momentImage?: string;
  hasMultipleMoments?: boolean;
}

interface Highlight {
  id: string;
  imageUrl: string;
  tripId: string;
  expense?: number;
  location?: string;
}

@Component({
  selector: 'app-moments',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './moments.component.html',
  styleUrl: './moments.component.scss'
})
export class MomentsComponent implements OnInit {
  router = inject(Router);
  travelStore = inject(TravelStore);

  tripId = input<string>('');

  trip = computed<Trip | null>(() => this.travelStore.trips().find(t => t.id === this.tripId()) ?? null);
  
  tripPosts = computed<Post[]>(() => this.travelStore.posts().filter(p => p.tripId === this.tripId()));
  
  tripExpenses = computed<Expense[]>(() => this.travelStore.expenses().filter(e => String(e['tripId']) === this.tripId()));

  currentDate = signal(new Date()); 
  selectedDate = signal<Date | null>(null);

  weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  constructor() {
    effect(() => {
      const t = this.trip();
      if (t?.startDate && !this.selectedDate()) {
        const d = new Date(t.startDate);
        // set to the 1st of the month
        this.currentDate.set(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() { }

  calendarGrid = computed<DayElement[]>(() => {
    const year = this.currentDate().getFullYear();
    const month = this.currentDate().getMonth();
    
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    const elements: DayElement[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      elements.push(this.createDayElement(new Date(year, month - 1, prevMonthLastDay - i), false, today));
    }
    
    for (let day = 1; day <= totalDays; day++) {
      elements.push(this.createDayElement(new Date(year, month, day), true, today));
    }
    
    let nextMonthDay = 1;
    while (elements.length < 42) {
      elements.push(this.createDayElement(new Date(year, month + 1, nextMonthDay++), false, today));
    }
    
    return elements;
  });

  highlights = computed<Highlight[]>(() => {
    const selected = this.selectedDate();
    const posts = this.tripPosts();
    const tid = this.tripId();

    if (!selected) {
      // General highlights for the trip (first 10 images)
      const allHighlights: Highlight[] = [];
      posts.forEach(p => {
        p.images.forEach(img => {
          allHighlights.push({ id: crypto.randomUUID(), imageUrl: img, tripId: tid });
        });
      });
      return allHighlights.slice(0, 10);
    } 
    
    // Daily highlights
    const selDateStr = this.toDateString(selected);
    const dayPosts = posts.filter(p => this.toDateString(new Date(p.timestamp)) === selDateStr);
    
    const dailyHighlights: Highlight[] = [];
    dayPosts.forEach(p => {
      p.images.forEach((img, i) => {
        dailyHighlights.push({ 
          id: p.id + '-' + i, 
          imageUrl: img, 
          tripId: tid,
          location: p.locationName
        });
      });
    });

    return dailyHighlights;
  });

  totalDailyExpense = computed<number>(() => {
    const selected = this.selectedDate();
    if (!selected) return 0;
    const selDateStr = this.toYMD(selected);
    const dayExpenses = this.tripExpenses().filter(e => e.date === selDateStr);
    return dayExpenses.reduce((sum, e) => sum + e.amount, 0);
  });

  private toDateString(d: Date): string {
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  private toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  createDayElement(date: Date, isCurrentMonth: boolean, today: Date): DayElement {
    date.setHours(0,0,0,0);
    const isToday = date.getTime() === today.getTime();
    
    let isInTrip = false;
    let isTripStart = false;
    let isTripEnd = false;
    const t = this.trip();

    if (t) {
      const start = new Date(t.startDate); start.setHours(0,0,0,0);
      const end = new Date(t.endDate); end.setHours(0,0,0,0);
      isInTrip = date >= start && date <= end;
      isTripStart = date.getTime() === start.getTime();
      isTripEnd = date.getTime() === end.getTime();
    }

    // Find moments for this date
    const dateStr = this.toDateString(date);
    const postsOnDay = this.tripPosts().filter(p => this.toDateString(new Date(p.timestamp)) === dateStr);
    
    let momentImage = undefined;
    let hasMultipleMoments = false;
    
    // Collect all images from all posts on this day
    const allImages = postsOnDay.flatMap(p => p.images);
    if (allImages.length > 0) {
      momentImage = allImages[0];
      hasMultipleMoments = allImages.length > 1 || postsOnDay.length > 1;
    }

    return { 
      date, 
      day: date.getDate(), 
      isCurrentMonth, 
      isToday,
      isInTrip,
      isTripStart,
      isTripEnd,
      tripId: this.tripId(),
      momentImage,
      hasMultipleMoments
    };
  }

  slideDirection = signal<'slide-left' | 'slide-right' | ''>('');

  prevMonth() {
    this.slideDirection.set('');
    setTimeout(() => {
      const current = this.currentDate();
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
      this.selectedDate.set(null); 
      this.slideDirection.set('slide-right');
    }, 10);
  }

  nextMonth() {
    this.slideDirection.set('');
    setTimeout(() => {
      const current = this.currentDate();
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
      this.selectedDate.set(null); 
      this.slideDirection.set('slide-left');
    }, 10);
  }

  selectDate(day: DayElement) {
    if (day.isCurrentMonth) {
      this.selectedDate.set(day.date);
    }
  }

  get isSelectionEmpty(): boolean {
    return this.selectedDate() !== null && this.highlights().length === 0;
  }

  // --- Gestures ---
  touchStartX = 0;
  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
  }
  onTouchEnd(event: TouchEvent) {
    const touchEndX = event.changedTouches[0].screenX;
    const swipeDist = this.touchStartX - touchEndX;
    if (swipeDist > 50) {
      this.nextMonth(); // Swipe left -> Next
    } else if (swipeDist < -50) {
      this.prevMonth(); // Swipe right -> Prev
    }
  }

  // --- Action ---
  onTabSwitch = output<string>();

  viewPost(item: Highlight) {
    this.onTabSwitch.emit('SOCIAL');
  }

  viewExpenses() {
    this.onTabSwitch.emit('EXPENSES');
  }
}
