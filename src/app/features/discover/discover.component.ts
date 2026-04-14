import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/services/toast.service';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { Post, Comment } from '../../core/models/social.model';
import { FormsModule } from '@angular/forms';

interface FeedItem {
  id: string;
  title: string;
  image: string;
  dateRange: string;
  locationType: string;
  likes: number;
  comments: number;
  hasLiked?: boolean;
  tripId?: string;
  photoCount?: number;
  postImages?: { url: string; location?: string }[];
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, TranslatePipe, FormsModule],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit {
  private travelStore = inject(TravelStore);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);

  readonly currentUserId = computed(() => this.travelStore.currentUserId());
  
  // ─── Comments state ───
  readonly commentTripId = signal<string | null>(null);
  commentText = '';
  readonly isSendingComment = signal(false);

  readonly activeCommentTrip = computed(() => {
    const id = this.commentTripId();
    if (!id) return null;
    return this.travelStore.trips().find(t => t.id === id) || null;
  });

  // ─── Image Viewer state ───
  readonly viewerOpen = signal(false);
  readonly viewerImages = signal<{ url: string; location?: string }[]>([]);
  readonly viewerIndex = signal(0);

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
        
        const tripPosts = this.travelStore.posts().filter(p => p.tripId === t.id);
        const feedImages: { url: string; location?: string }[] = [];
        tripPosts.forEach(p => {
          (p.images || []).forEach(url => {
            if (url && !feedImages.some(img => img.url === url)) {
              feedImages.push({ url, location: p.locationName || p.locationCity });
            }
          });
        });
        
        // Push cover image to the end so it anchors the stack if they only have a few post images
        if (t.coverImage && !feedImages.some(img => img.url === t.coverImage)) {
          feedImages.push({ url: t.coverImage, location: t.locationName || t.locationCity });
        }
        
        const photoCount = feedImages.length;
        
        let totalLikes = 0;
        let totalComments = 0;
        tripPosts.forEach(p => {
          totalLikes += (p.likes || 0);
          totalComments += (Array.isArray(p.comments) ? p.comments.length : 0);
        });

        // Calculate Days & Nights (x Ngày x Đêm -> xNxD format)
        let durationStr = '1N0D';
        if (t.startDate && t.endDate) {
          const start = new Date(t.startDate);
          const end = new Date(t.endDate);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of start day
            const nights = diffDays > 1 ? diffDays - 1 : 0;
            durationStr = `${diffDays}N${nights}D`;
          }
        }
        
        const tripLikesCount = Array.isArray(t.likes) ? t.likes.length : 0;
        const tripCommentsCount = Array.isArray(t.comments) ? t.comments.length : 0;
        const hasLiked = Array.isArray(t.likes) && t.likes.includes(this.currentUserId());
        
        return {
          id: t.id,
          title: t.title,
          image: t.coverImage || 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop',
          dateRange: durationStr,
          locationType: t.locationName || t.locationCity || 'GLOBAL',
          likes: tripLikesCount,
          comments: tripCommentsCount,
          hasLiked: hasLiked,
          tripId: t.id,
          totalCost: totalCost,
          totalCostFormatted: totalCost > 0 ? `₫${totalCost.toLocaleString('en-US')}` : 'Free',
          photoCount: photoCount,
          postImages: feedImages
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

  async onLikeClick(event: Event, item: FeedItem) {
    event.stopPropagation();
    event.preventDefault();
    
    const trip = this.travelStore.trips().find(t => t.id === item.tripId);
    if (!trip) return;
    
    const uid = this.currentUserId();
    const currentLikes = Array.isArray(trip.likes) ? trip.likes : [];
    const isCurrentlyLiked = currentLikes.includes(uid);
    const newLiked = !isCurrentlyLiked;
    
    // Optimistic array formulation
    let updatedLikes: string[];
    if (newLiked) {
      updatedLikes = isCurrentlyLiked ? currentLikes : [...currentLikes, uid];
    } else {
      updatedLikes = currentLikes.filter(id => id !== uid);
    }
    
    // Optimistic UI update
    this.travelStore.updateTrip(trip.id, { likes: updatedLikes });
    
    try {
      const db = this.supabaseService.client;
      // Re-fetch latest from db to avoid race condition
      const { data, error } = await db.from('trips').select('likes').eq('id', trip.id).single();
      if (error) throw error;
      
      let freshLikes: string[] = [];
      if (data && data.likes) {
        if (Array.isArray(data.likes)) {
          freshLikes = data.likes;
        } else if (typeof data.likes === 'string') {
          try { freshLikes = JSON.parse(data.likes); } catch(e) {}
        }
      }
      
      if (newLiked) {
        freshLikes = !freshLikes.includes(uid) ? [...freshLikes, uid] : freshLikes;
      } else {
        freshLikes = freshLikes.filter(id => id !== uid);
      }
      
      const { error: updateError } = await db.from('trips').update({ likes: freshLikes }).eq('id', trip.id);
      if (updateError) throw updateError;
      
      this.travelStore.updateTrip(trip.id, { likes: freshLikes });
      
      // Notify host if it's a new like and we are not the host
      if (newLiked && uid !== trip.ownerId) {
        const profile = this.travelStore.currentUserProfile();
        db.from('notifications').insert({
          type: 'TRIP_LIKE',
          user_id: trip.ownerId,
          actor_name: profile?.name || 'Traveler',
          actor_avatar: profile?.avatar || null,
          message: 'liked your trip',
          trip_id: trip.id
        }).then(); // Fire and forget
      }
    } catch(err) {
      // Revert on error
      this.travelStore.updateTrip(trip.id, { likes: currentLikes });
      console.error('Like failed:', err);
    }
  }

  onCommentClick(event: Event, item: FeedItem) {
    event.stopPropagation();
    event.preventDefault();
    
    if (item.tripId) {
      this.commentTripId.set(item.tripId);
      this.commentText = '';
    }
  }

  closeComments() {
    this.commentTripId.set(null);
    this.commentText = '';
  }

  async sendComment() {
    const text = this.commentText.trim();
    const activeTrip = this.activeCommentTrip();
    if (!text || !activeTrip) return;
    
    this.isSendingComment.set(true);
    
    try {
      const uid = this.travelStore.currentUserId();
      const profile = this.travelStore.currentUserProfile();
      const authorName = profile?.name || 'Traveler';
      
      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: uid,
        authorName,
        authorAvatar: profile?.avatar || undefined,
        text,
        timestamp: new Date().toISOString()
      };
      
      const existingComments = activeTrip.comments || [];
      const updatedComments = [...existingComments, newComment];
      
      // Optimistic update
      this.travelStore.updateTrip(activeTrip.id, { comments: updatedComments });
      this.commentText = '';
      
      const db = this.supabaseService.client;
      // To mimic the RPC logic, we will fall back to manual array append since we haven't created the RPC for trips yet
      const { data: freshTrip } = await db.from('trips').select('comments').eq('id', activeTrip.id).single();
      let freshComments: any[] = [];
      if (freshTrip && freshTrip.comments) {
          const raw = freshTrip.comments;
          if (Array.isArray(raw)) freshComments = raw;
          else if (typeof raw === 'string') {
            try { freshComments = JSON.parse(raw); } catch(e){}
          }
      }
      const safelyMerged = [...freshComments, newComment];
      await db.from('trips').update({ comments: safelyMerged }).eq('id', activeTrip.id);
      
      // Notify host
      if (uid !== activeTrip.ownerId) {
        db.from('notifications').insert({
          type: 'TRIP_COMMENT',
          user_id: activeTrip.ownerId,
          actor_name: authorName,
          actor_avatar: profile?.avatar || null,
          message: 'commented on your trip',
          trip_id: activeTrip.id
        }).then(); // Fire and forget
      }
    } catch(err: any) {
      this.toastService.show(err.message || 'Failed to send comment', 'error');
    } finally {
      this.isSendingComment.set(false);
    }
  }

  onShareClick(event: Event, item: FeedItem) {
    event.stopPropagation();
    event.preventDefault();
    const url = window.location.origin + '/trip/' + (item.tripId || item.id);
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: `Check out this amazing trip to ${item.locationType} on WanderPool!`,
        url: url
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.toastService.show('Link copied to clipboard!', 'success');
      }).catch(() => {
        this.toastService.show('Failed to copy link', 'error');
      });
    }
  }

  // ─── Helpers ───
  getAvatarBg(name: string): string {
    const colors = ['#FCA5A5', '#FCD34D', '#86EFAC', '#93C5FD', '#C4B5FD', '#F9A8D4'];
    const charCode = name.charCodeAt(0) || 0;
    return colors[charCode % colors.length];
  }

  getAvatarColor(name: string): string {
    const colors = ['#991B1B', '#B45309', '#166534', '#1E3A8A', '#5B21B6', '#9D174D'];
    const charCode = name.charCodeAt(0) || 0;
    return colors[charCode % colors.length];
  }

  formatRelative(dateStr: string): string {
    const date = new Date(dateStr);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  }

  // ─── Image Viewer Handlers ───
  openImageViewer(event: Event, images?: { url: string; location?: string }[], startIndex: number = 0) {
    event.stopPropagation();
    event.preventDefault();
    if (!images || images.length === 0) return;
    this.viewerImages.set(images);
    this.viewerIndex.set(startIndex);
    this.viewerOpen.set(true);
    
    setTimeout(() => {
      const el = document.querySelector('.viewer-carousel') as HTMLElement;
      if (el) el.scrollLeft = el.clientWidth * startIndex;
    }, 10);
  }

  closeImageViewer() {
    this.viewerOpen.set(false);
  }

  onViewerScroll(event: Event) {
    const el = event.target as HTMLElement;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    this.viewerIndex.set(index);
  }

  nextViewerImage(carousel: HTMLElement, event?: Event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const current = this.viewerIndex();
    if (current < this.viewerImages().length - 1) {
      carousel.scrollTo({ left: carousel.clientWidth * (current + 1), behavior: 'smooth' });
    } else {
      carousel.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }

  prevViewerImage(carousel: HTMLElement, event?: Event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const current = this.viewerIndex();
    if (current > 0) {
      carousel.scrollTo({ left: carousel.clientWidth * (current - 1), behavior: 'smooth' });
    } else {
      carousel.scrollTo({ left: carousel.clientWidth * (this.viewerImages().length - 1), behavior: 'smooth' });
    }
  }
}
