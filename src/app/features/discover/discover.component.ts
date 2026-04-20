import { Component, inject, computed, OnInit, signal, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
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

import { TranslatePipe } from '../../core/i18n/translate.pipe';

import { LowerCasePipe } from '@angular/common';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslatePipe, LowerCasePipe],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit, OnDestroy {
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
  
  readonly currentTab = signal<'CATCH_UP' | 'COMMUNITY'>('CATCH_UP');
  
  readonly catchUpPosts = computed(() => {
    const myTripIds = this.travelStore.myTrips().map(t => t.id);
    return this.travelStore.posts()
      .filter(p => p.tripId && myTripIds.includes(p.tripId))
      .slice(0, 20);
  });
  
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

  ngAfterViewInit() {
    this.scrollContainer = document.querySelector('.shell-content') as HTMLElement;
    if (this.scrollContainer) {
      this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
    }
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  ngOnDestroy() {
    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.onScroll);
    }
    window.removeEventListener('scroll', this.onScroll);
  }

  // ─── Dynamic Header Scroll ───
  readonly headerHidden = signal(false);
  private lastScrollTop = 0;
  private scrollContainer: HTMLElement | null = null;
  private scrollThreshold = 100; // Increased threshold for less twitchy header

  onScroll = () => {
    // Determine scroll position from either container or window
    const st = this.scrollContainer && this.scrollContainer.scrollTop > 0 
      ? this.scrollContainer.scrollTop 
      : (window.scrollY || document.documentElement.scrollTop);
      
    if (st > this.lastScrollTop && st > this.scrollThreshold) {
      this.headerHidden.set(true); // scrolling down -> hide
    } else if (st < this.lastScrollTop || st < this.scrollThreshold) {
      this.headerHidden.set(false); // scrolling up -> show
    }
    this.lastScrollTop = Math.max(0, st);
  };

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

  // ─── Feed Methods ───
  getTripDetails(tripId?: string) {
    if (!tripId) return undefined;
    return this.travelStore.myTrips().find(t => t.id === tripId);
  }

  goToTrip(id?: string) {
    if (!id) return;
    this.router.navigate(['/trip', id]);
  }

  // ─── Post Actions (Catch Up Feed) ───
  async togglePostLike(postId: string) {
    const db = this.supabaseService.client;
    const uid = this.currentUserId();
    const post = this.travelStore.posts().find(p => p.id === postId);
    if (!post) return;

    const newLiked = !post.hasLiked;
    const newLikes = newLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
    this.travelStore.updatePost(postId, { hasLiked: newLiked, likes: newLikes });

    try {
      const { data, error } = await db.from('posts').select('likes').eq('id', postId).single();
      if (error) throw error;

      let currentLikes: string[] = [];
      if (data && data['likes']) {
        const raw = data['likes'];
        if (Array.isArray(raw)) currentLikes = raw;
        else if (typeof raw === 'string') {
          try { currentLikes = JSON.parse(raw); } catch(e){}
        }
      }
      
      const userIndex = currentLikes.indexOf(uid);
      let updatedLikes: string[];

      if (newLiked) {
        updatedLikes = userIndex === -1 ? [...currentLikes, uid] : currentLikes;
      } else {
        updatedLikes = currentLikes.filter(id => id !== uid);
      }

      await db.from('posts').update({ likes: updatedLikes }).eq('id', postId);
      this.travelStore.updatePost(postId, { hasLiked: updatedLikes.includes(uid), likes: updatedLikes.length });
    } catch (err: any) {
      this.travelStore.updatePost(postId, { hasLiked: post.hasLiked, likes: post.likes });
    }
  }

  private tapTimers = new Map<string, number>();

  onImageTap(event: Event, post: Post) {
    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      if (event.type === 'touchstart') {
        (target as any)._hasTouch = true;
      } else if (event.type === 'click' && (target as any)._hasTouch) {
        return; // Skip click if handled by touch
      }
    }

    const now = Date.now();
    const lastTap = this.tapTimers.get(post.id) || 0;
    
    if (now - lastTap > 0 && now - lastTap < 500) { // 500ms allows easier tap
      this.handleDoubleTapAnimation(event, post);
      this.tapTimers.set(post.id, 0); // reset
    } else {
      this.tapTimers.set(post.id, now);
    }
  }

  handleDoubleTapAnimation(event: Event, post: Post) {
    event.preventDefault();
    
    // Only like if not already liked
    if (!post.hasLiked) {
      this.togglePostLike(post.id);
    }
    
    // Create animated heart
    const target = event.currentTarget as HTMLElement;
    const heart = document.createElement('div');
    heart.innerHTML = '<svg fill="#EF4444" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    heart.className = 'pop-heart-anim';
    
    // Styles for popping animation
    heart.style.position = 'absolute';
    heart.style.top = '50%';
    heart.style.left = '50%';
    heart.style.transform = 'translate(-50%, -50%) scale(0)';
    heart.style.width = '100px';
    heart.style.height = '100px';
    heart.style.pointerEvents = 'none';
    heart.style.zIndex = '10';
    heart.style.animation = 'popHeartAnim 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    heart.style.opacity = '0.9';
    heart.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))';
    
    target.style.position = 'relative'; 
    target.appendChild(heart);
    
    setTimeout(() => {
      if (heart.parentNode === target) {
        target.removeChild(heart);
      }
    }, 850);
  }

  readonly commentPostId = signal<string | null>(null);
  
  readonly activeCommentPost = computed(() => {
    const id = this.commentPostId();
    if (!id) return null;
    return this.travelStore.posts().find(p => p.id === id) || null;
  });
  
  openPostComments(post: Post) {
    this.commentPostId.set(post.id);
    this.commentText = '';
  }

  closePostComments() {
    this.commentPostId.set(null);
    this.commentText = '';
  }

  async sendPostComment() {
    const text = this.commentText.trim();
    const activePost = this.activeCommentPost();
    if (!text || !activePost) return;
    
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
      
      const existingComments = Array.isArray(activePost.comments) ? activePost.comments : [];
      const updatedComments = [...existingComments, newComment];
      
      // Optimistic upate (local)
      this.travelStore.updatePost(activePost.id, { comments: updatedComments });
      this.commentText = '';
      
      // Update Supabase using RPC to avoid race conditions on JSONB arrays
      const db = this.supabaseService.client;
      const { error } = await db.rpc('add_post_comment', {
        p_post_id: activePost.id,
        p_comment: newComment
      });
      
      if (error) {
        console.warn('RPC failed, falling back to full array replace:', error);
        const { data: freshPost } = await db.from('posts').select('comments').eq('id', activePost.id).single();
        let freshComments: any[] = [];
        if (freshPost && freshPost.comments) {
            const raw = freshPost.comments;
            if (Array.isArray(raw)) freshComments = raw;
            else if (typeof raw === 'string') {
              try { freshComments = JSON.parse(raw); } catch(e){}
            }
        }
        const safelyMerged = [...freshComments, newComment];
        await db.from('posts').update({ comments: safelyMerged }).eq('id', activePost.id);
      }
      
    } catch(err: any) {
      this.toastService.show(err.message || 'Failed to send comment', 'error');
    } finally {
      this.isSendingComment.set(false);
    }
  }

  sharePost(post: Post) {
    const url = window.location.origin + '/trip/' + post.tripId;
    if (navigator.share) {
      navigator.share({
        title: 'Check this moment!',
        text: `See this amazing moment by ${post.authorName} on WanderPool!`,
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

  // ─── Post Image Carousel ───
  activePostImageIndex = signal<Record<string, number>>({});

  onPostImageScroll(postId: string, event: Event) {
    const target = event.target as HTMLElement;
    const scrollLeft = target.scrollLeft;
    const clientWidth = target.clientWidth;
    const index = Math.round(scrollLeft / (clientWidth - 32));
    const current = this.activePostImageIndex()[postId] || 0;
    if (current !== index) {
      this.activePostImageIndex.update(m => ({ ...m, [postId]: index }));
    }
  }

  getPostActiveImageIndex(postId: string): number {
    return this.activePostImageIndex()[postId] || 0;
  }
}
