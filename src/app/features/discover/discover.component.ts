import { Component, inject, computed, OnInit, signal } from '@angular/core';
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

  readonly searchQuery = signal('');
  readonly activeFilter = signal('All');
  readonly filters = ['All', 'Trending', 'Vietnam', 'Japan', 'Beach', 'Camping'];
  
  readonly isLoading = computed(() => this.travelStore.isSyncing() || this.travelStore.trips().length === 0);

  readonly displayedTrips = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.activeFilter();
    let publicTrips = this.travelStore.publicTrips();
    const allExpenses = this.travelStore.expenses();

    // Apply quick filters (simulated logic for demo purposes based on title/location)
    if (filter !== 'All') {
      publicTrips = publicTrips.filter(t => {
        const fullText = `${t.title} ${t.locationName} ${t.locationCity}`.toLowerCase();
        if (filter === 'Trending') return true; // Just show all or mock it
        if (filter === 'Vietnam') return fullText.includes('vietnam') || fullText.includes('vn') || fullText.includes('đà lạt') || fullText.includes('phú quốc');
        if (filter === 'Japan') return fullText.includes('japan') || fullText.includes('tokyo');
        if (filter === 'Beach') return fullText.includes('beach') || fullText.includes('biển') || fullText.includes('phú quốc');
        if (filter === 'Camping') return fullText.includes('camp') || fullText.includes('đà lạt');
        return true;
      });
    }

    return publicTrips
      .filter(t => {
        if (!query) return true;
        const nameMatch = t.title?.toLowerCase().includes(query) ?? false;
        const locMatch = t.locationName?.toLowerCase().includes(query) ?? false;
        const cityMatch = t.locationCity?.toLowerCase().includes(query) ?? false;
        return nameMatch || locMatch || cityMatch;
      })
      .map(t => {
        const tripExpenses = allExpenses.filter(e => e.tripId === t.id);
        const totalCost = tripExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        return {
          id: t.id,
          title: t.title,
          image: t.coverImage || 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
          dateRange: `${t.startDate} - ${t.endDate}`,
          locationType: t.locationName || t.locationCity || 'GLOBAL',
          likes: 0,
          comments: 0,
          tripId: t.id,
          totalCost: totalCost,
          totalCostFormatted: totalCost > 0 ? `₫${totalCost.toLocaleString('en-US')}` : 'Free'
        };
      });
  });

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  setFilter(f: string) {
    this.activeFilter.set(f);
  }

  async ngOnInit() {
    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }
  }
}
