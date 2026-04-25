import { Component, inject, computed, OnInit, signal, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { Post, Comment } from '../../core/models/social.model';
import { PostDetailService } from '../post-detail/services/post-detail.service';
import { LikesModalComponent } from '../post-detail/components/likes-modal/likes-modal.component';
import { MentionInputComponent } from '../../shared/components/mention-input/mention-input.component';
import { PhotoViewerService } from '../../core/services/photo-viewer.service';
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
import { getAvatarBg, getAvatarColor } from '../../core/utils/avatar.util';
import { formatRelative } from '../../core/utils/format.util';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslatePipe, LowerCasePipe, LikesModalComponent, MentionInputComponent],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.scss'
})
export class DiscoverComponent implements OnInit, OnDestroy {
  private travelStore = inject(TravelStore);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private postDetailService = inject(PostDetailService);
  private confirmService = inject(ConfirmService);
  private photoViewerService = inject(PhotoViewerService);

  readonly currentUserId = computed(() => this.travelStore.currentUserId());
  
  // ─── Likes Modal State ───
  readonly likesPostId = signal<string | null>(null);

  openLikesList(postId: string) {
    this.likesPostId.set(postId);
  }

  closeLikesModal() {
    this.likesPostId.set(null);
  }
  
  // ─── Comments state ───
  readonly commentTripId = signal<string | null>(null);
  commentText = '';
  readonly isSendingComment = signal(false);

  get mentionCandidates() {
    const tripId = this.commentTripId();
    if (!tripId) return [];
    const trip = this.travelStore.trips().find(t => t.id === tripId);
    if (!trip || !trip.members) return [];
    return trip.members.map(m => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar
    }));
  }

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
          totalComments += (p.commentCount || 0);
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
          likes: tripLikesCount + totalLikes,
          comments: tripCommentsCount + totalComments,
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
    
    // Haptic Feedback (Vibrate slightly more on 'Like' than 'Unlike')
    if (navigator.vibrate) {
      navigator.vibrate(newLiked ? 15 : 10);
    }
    
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
          try { freshLikes = JSON.parse(data.likes); } catch(e: any) {}
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
        db.rpc('handle_batched_notification', {
          p_type: 'TRIP_LIKE',
          p_user_id: trip.ownerId,
          p_actor_name: profile?.name || 'Traveler',
          p_actor_avatar: profile?.avatar || null,
          p_message: 'liked your trip',
          p_trip_id: trip.id
        }).then(); // Fire and forget
      }
    } catch(err: any) {
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

  replyToComment(c: any) {
    const current = this.commentText;
    const formattedName = c.authorName?.replace(/\s+/g, '') || 'User';
    this.commentText = `${current ? current + ' ' : ''}@${formattedName} `;
  }

  formatMention(text: string): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    let safeText = div.innerHTML;
    const candidates = this.mentionCandidates;
    if (candidates && candidates.length > 0) {
      const sortedNames = [...candidates].sort((a, b) => b.name.length - a.name.length);
      const escapedNames = sortedNames.map(c => c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp(`@(${escapedNames.join('|')})(?![\\w\\p{L}])`, 'gu');
      safeText = safeText.replace(regex, '<strong class="mention-text">@$1</strong>');
    }
    
    return safeText.replace(/@([^\s]+)/g, '<strong class="mention-text">@$1</strong>');
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
            try { freshComments = JSON.parse(raw); } catch(e: any){}
          }
      }
      const safelyMerged = [...freshComments, newComment];
      await db.from('trips').update({ comments: safelyMerged }).eq('id', activeTrip.id);
      
      // Notify host
      if (uid !== activeTrip.ownerId) {
        db.rpc('handle_batched_notification', {
          p_type: 'TRIP_COMMENT',
          p_user_id: activeTrip.ownerId,
          p_actor_name: authorName,
          p_actor_avatar: profile?.avatar || null,
          p_message: 'commented on your trip',
          p_trip_id: activeTrip.id
        }).then(); // Fire and forget
      }
    } catch(err: any) {
      this.toastService.show(err.message || 'Failed to send comment', 'error');
    } finally {
      this.isSendingComment.set(false);
    }
  }

  async deleteComment(commentId: string, tripId: string) {
    const confirmed = await this.confirmService.confirm('Bạn có chắc chắn muốn xóa bình luận này?', 'Xóa bình luận', 'Xóa', 'Hủy');
    if (!confirmed) return;
    
    try {
      const activeTrip = this.travelStore.trips().find(t => t.id === tripId);
      if (!activeTrip) return;
      
      const existingComments = activeTrip.comments || [];
      const updatedComments = existingComments.filter((c: any) => c.id !== commentId);
      
      // Optimistic update
      this.travelStore.updateTrip(activeTrip.id, { comments: updatedComments });
      
      const db = this.supabaseService.client;
      const { error } = await db.from('trips').update({ comments: updatedComments }).eq('id', activeTrip.id);
      if (error) throw error;
    } catch(err: any) {
      console.error('Lỗi xóa comment', err);
      this.toastService.show(err.message || 'Không thể xóa bình luận.', 'error');
      // Revert could be done here by re-fetching
    }
  }

  onShareClick(event: Event, item: FeedItem) {
    event.stopPropagation();
    event.preventDefault();
    const url = window.location.origin + '/trip/' + (item.tripId || item.id);
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: `Check out this amazing trip to ${item.locationType} on WanderPool!\n\n`,
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

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;
  formatRelative = formatRelative;

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
    
    // Haptic Feedback
    if (navigator.vibrate) {
      navigator.vibrate(newLiked ? 15 : 10);
    }

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
          try { currentLikes = JSON.parse(raw); } catch(e: any){}
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
  private tapTimeouts = new Map<string, any>();

  onImageTap(event: Event, post: Post) {
    const target = event.currentTarget as HTMLElement | null;

    const now = Date.now();
    const lastTap = this.tapTimers.get(post.id) || 0;
    
    if (now - lastTap > 0 && now - lastTap < 300) { 
      // Double tap!
      clearTimeout(this.tapTimeouts.get(post.id));
      this.handleDoubleTapAnimation(event, post);
      this.tapTimers.set(post.id, 0); // reset
    } else {
      this.tapTimers.set(post.id, now);
      // Reset timer after 300ms, single tap action: Open Image Viewer
      const timeout = setTimeout(() => {
        this.tapTimers.set(post.id, 0);
        const scrollLeft = target?.scrollLeft || 0;
        const clientWidth = target?.clientWidth || 1;
        const startIndex = Math.round(scrollLeft / (clientWidth - 32)) || 0;
        
        if (post.images && post.images.length > 0) {
          this.photoViewerService.open(post.images, startIndex);
        }
      }, 300);
      this.tapTimeouts.set(post.id, timeout);
    }
  }

  doubleTapStates = signal<Record<string, boolean>>({});

  handleDoubleTapAnimation(event: Event, post: Post) {
    event.preventDefault();
    
    // Only like if not already liked
    if (!post.hasLiked) {
      this.togglePostLike(post.id);
    }
    
    // Show heart overlay
    this.doubleTapStates.update(s => ({ ...s, [post.id]: true }));
    
    setTimeout(() => {
      this.doubleTapStates.update(s => ({ ...s, [post.id]: false }));
    }, 850);
  }

  openPostComments(post: Post) {
    this.router.navigate(['/post', post.id]);
  }

  activePostMenu = signal<string | null>(null);

  async deletePost(post: Post) {
    this.activePostMenu.set(null);
    const confirmed = await this.confirmService.confirm('Bạn có chắc chắn muốn xóa bài viết này?', 'Xóa bài viết', 'Xóa', 'Hủy');
    if (!confirmed) return;
    
    try {
      this.travelStore.deletePost(post.id); // optimistic
      const db = this.supabaseService.client;
      
      const pathsToDelete = (post.images || [])
        .filter(url => url && url.includes('/nomadsync-media/'))
        .map(url => url.split('/nomadsync-media/')[1]);

      if (pathsToDelete.length > 0) {
        await db.from('posts').update({ image_urls: null }).eq('id', post.id);
      }

      // Delete references first to avoid foreign key constraint errors
      await db.from('comments').delete().eq('post_id', post.id);
      await db.from('notifications').delete().eq('post_id', post.id);

      const { error } = await db.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }
      
      this.toastService.show('Đã xóa bài viết', 'success');
    } catch(err: any) {
      console.error('Delete post error:', err);
      this.toastService.show('Không thể xóa bài viết', 'error');
    }
  }

  reportPost(post: Post) {
    this.activePostMenu.set(null);
    this.toastService.show('Đã báo cáo bài viết', 'success');
  }

  sharePost(post: Post) {
    const url = window.location.origin + '/trip/' + post.tripId;
    if (navigator.share) {
      navigator.share({
        title: 'Check this moment!',
        text: `See this amazing moment by ${post.authorName} on WanderPool!\n\n`,
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
