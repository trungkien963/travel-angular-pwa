import { Component, inject, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

interface FeedItem {
  id: string;
  title: string;
  image: string;
  dateRange: string;
  locationType: string;
  likes: number;
  comments: number;
  tripId?: string;
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit {
  private travelStore = inject(TravelStore);

  readonly unreadCount = computed(() => this.travelStore.unreadCount());

  // Unified feed items matching the new UI design
  readonly feedItems: FeedItem[] = [
    {
      id: 'f1',
      title: 'Bảo Lộc',
      image: 'https://images.unsplash.com/photo-1542272201-b1ca555f8505?w=800&auto=format&fit=crop', // Foggy trees landscape
      dateRange: 'Apr 29 - May 1, 2026',
      locationType: 'GLOBAL',
      likes: 0,
      comments: 12
    },
    {
      id: 'f2',
      title: 'Da Lat',
      image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&auto=format&fit=crop', // Vietnam scenery
      dateRange: 'May 12 - May 15, 2026',
      locationType: 'GLOBAL',
      likes: 54,
      comments: 8
    },
    {
      id: 'f3',
      title: 'Phu Quoc',
      image: 'https://images.unsplash.com/photo-1600093678033-9097723af8bb?w=800&auto=format&fit=crop', // Beach
      dateRange: 'Jun 1 - Jun 5, 2026',
      locationType: 'GLOBAL',
      likes: 120,
      comments: 24
    }
  ];

  async ngOnInit() {
    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }
  }
}
