import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';

interface PinItem {
  id: string;
  title: string;
  image: string;
  location?: string;
  height: number;
  tripId?: string;
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit {
  private travelStore = inject(TravelStore);

  readonly unreadCount = computed(() => this.travelStore.unreadCount());
  activeCategory = 'for-you';

  readonly categories = [
    { id: 'for-you', label: 'For You' },
    { id: 'following', label: 'Following' },
    { id: 'trending', label: 'Trending' },
    { id: 'nearby', label: 'Nearby' },
  ];

  // Inspiration pins (static showcase, matching original React Native screen)
  readonly leftPins: PinItem[] = [
    { id: 'p1', title: 'Summer Breeze', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop', location: 'Oceania', height: 260 },
    { id: 'p2', title: 'Poolside Sips', image: 'https://images.unsplash.com/photo-1532853270311-c918ee97268b?w=800&auto=format&fit=crop', height: 180 },
    { id: 'p3', title: 'Sailing Day', image: 'https://images.unsplash.com/photo-1544465544-1b71aee9dfa3?w=800&auto=format&fit=crop', location: 'Adriatic Sea', height: 260 },
  ];

  readonly rightPins: PinItem[] = [
    { id: 'p4', title: 'Into the Blue', image: 'https://images.unsplash.com/photo-1535262412228-673dc34efaca?w=800&auto=format&fit=crop', location: 'Maldives', height: 320 },
    { id: 'p5', title: 'Coastal Drive', image: 'https://images.unsplash.com/photo-1600093678033-9097723af8bb?w=800&auto=format&fit=crop', height: 220 },
    { id: 'p6', title: 'Crystal Clear', image: 'https://images.unsplash.com/photo-1498307833015-e7b400441eb8?w=800&auto=format&fit=crop', location: 'Bora Bora', height: 280 },
  ];

  async ngOnInit() {
    // Initialize store data if not already loaded
    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }
  }

  setCategory(id: string) {
    this.activeCategory = id;
  }
}
