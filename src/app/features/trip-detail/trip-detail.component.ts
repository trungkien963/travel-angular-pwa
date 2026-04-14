import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Expense, Member } from '../../core/models/expense.model';
import { Post, Comment } from '../../core/models/social.model';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MomentsComponent } from '../moments/moments.component';
import * as XLSX from 'xlsx';

export interface Debt {
  fromId: string; fromName: string;
  toId: string; toName: string;
  amount: number;
}

const CATEGORY_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  FOOD:       { emoji: '🍔', label: 'Food',        color: '#F59E0B', bg: '#FEF3C7' },
  TRANSPORT:  { emoji: '🚕', label: 'Transport',   color: '#3B82F6', bg: '#DBEAFE' },
  HOTEL:      { emoji: '🏨', label: 'Hotel',       color: '#8B5CF6', bg: '#EDE9FE' },
  ACTIVITIES: { emoji: '🎯', label: 'Activities',  color: '#10B981', bg: '#D1FAE5' },
  SHOPPING:   { emoji: '🛍️', label: 'Shopping',   color: '#EC4899', bg: '#FCE7F3' },
  OTHER:      { emoji: '💳', label: 'Other',       color: '#6B7280', bg: '#F3F4F6' },
};

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [FormsModule, MomentsComponent],
  templateUrl: './trip-detail.component.html',
  styleUrl: './trip-detail.component.scss'
})
export class TripDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);

  readonly defaultCover = 'https://images.unsplash.com/photo-1473496169904-6a58eb22bf2f?q=80&w=1000';

  readonly tabs = ['MOMENTS', 'SOCIAL', 'EXPENSES', 'BALANCES', 'MEMBERS'];
  activeTab = 'SOCIAL';
  quickPostMode = false;

  // ─── Edit Trip State ────────────────────────────────────────────────────────
  editTripModal = false;
  editTripTitle = '';
  editTripLocation = '';
  editTripStartDate = '';
  editTripEndDate = '';
  editTripCoverPreviewUrl: string | null = null;
  editTripCoverFile: File | null = null;
  readonly editLocationSuggestions = signal<any[]>([]);
  readonly isEditLocationLoading = signal(false);
  private editLocationTimeout: any;
  readonly isSavingTrip = signal(false);
  @ViewChild('editFileInput') editFileInput!: ElementRef<HTMLInputElement>;

  openEditTrip() {
    const t = this.trip();
    if (!t) return;
    this.editTripTitle = t.title || '';
    this.editTripLocation = t.locationName || '';
    this.editTripStartDate = t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : '';
    this.editTripEndDate = t.endDate ? new Date(t.endDate).toISOString().split('T')[0] : '';
    this.editTripCoverPreviewUrl = t.coverImage || null;
    this.editTripCoverFile = null;
    this.editTripModal = true;
  }

  closeEditTrip() {
    this.editTripModal = false;
  }

  triggerEditImageInput() {
    if (this.editFileInput?.nativeElement) {
      this.editFileInput.nativeElement.click();
    }
  }

  onEditImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editTripCoverFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.editTripCoverPreviewUrl = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  onEditLocationChange(query: string) {
    clearTimeout(this.editLocationTimeout);
    if (!query || query.trim().length < 2) {
      this.editLocationSuggestions.set([]);
      this.isEditLocationLoading.set(false);
      return;
    }
    
    this.isEditLocationLoading.set(true);
    this.editLocationTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        this.editLocationSuggestions.set(data);
      } catch (err) {
        console.error('Failed to fetch locations', err);
        this.editLocationSuggestions.set([]);
      } finally {
        this.isEditLocationLoading.set(false);
      }
    }, 400);
  }

  selectEditLocation(loc: any) {
    this.editTripLocation = loc.display_name;
    this.editLocationSuggestions.set([]);
  }

  openEditDatePicker(event: Event, inputEl: HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
      } else {
        inputEl.click();
      }
    } catch (e) {
      console.warn('Native date picker not supported or cannot be opened programmatically.', e);
    }
  }

  async saveEditTrip() {
    if (!this.editTripTitle.trim()) {
      this.toastService.show('Please enter a trip title!', 'error');
      return;
    }
    if (this.editTripStartDate > this.editTripEndDate) {
      this.toastService.show('Start date must be before end date!', 'error');
      return;
    }
    
    const t = this.trip();
    if (!t) return;
    
    this.isSavingTrip.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const db = this.supabaseService.client;
      let finalCoverUrl = t.coverImage;

      if (this.editTripCoverFile) {
        try {
          const ext = this.editTripCoverFile.name.split('.').pop();
          const path = `covers/${Date.now()}.${ext}`;
          const { data, error } = await db.storage
            .from('nomadsync-media')
            .upload(path, this.editTripCoverFile, { contentType: this.editTripCoverFile.type });
            
          if (!error && data) {
            const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
            finalCoverUrl = urlData.publicUrl;
            
            // Delete old cover if it's from our storage bucket
            if (t.coverImage && t.coverImage.includes('/nomadsync-media/')) {
               const oldPath = t.coverImage.split('/nomadsync-media/')[1];
               if (oldPath) {
                 await db.storage.from('nomadsync-media').remove([oldPath]);
               }
            }
          }
        } catch (e) {
          console.warn('Cover upload failed', e);
        }
      }

      const updateData = {
        title: this.editTripTitle,
        cover_image: finalCoverUrl,
        location_name: this.editTripLocation || null,
        location_city: this.editTripLocation || null,
        start_date: this.editTripStartDate,
        end_date: this.editTripEndDate,
      };

      const { error } = await db.from('trips').update(updateData).eq('id', t.id);
      if (error) throw error;

      this.travelStore.updateTrip(t.id, {
        title: this.editTripTitle,
        coverImage: finalCoverUrl,
        locationName: this.editTripLocation || undefined,
        locationCity: this.editTripLocation || undefined,
        startDate: this.editTripStartDate,
        endDate: this.editTripEndDate
      });
      
      this.toastService.show('Trip updated successfully!', 'success');
      this.closeEditTrip();
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to update trip.', 'error');
    } finally {
      this.isSavingTrip.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
  selectedExpense: Expense | null = null;

  readonly expenseModalOpen = signal(false);
  readonly isSavingExpense = signal(false);
  editingExpense: Expense | null = null;

  // ─── Comments modal state ──────────────────────────────────────────────
  readonly commentPostId = signal<string | null>(null);
  
  readonly activeCommentPost = computed(() => {
    const id = this.commentPostId();
    if (!id) return null;
    return this.tripPosts().find(p => p.id === id) || null;
  });

  commentText = '';
  readonly isSendingComment = signal(false);

  // ─── Edit Post modal state ─────────────────────────────────────────────
  readonly editPostOpen = signal(false);
  editPostObj: Post | null = null;
  editPostContent = '';
  readonly isSavingPost = signal(false);
  readonly activeMenuId = signal<string | null>(null);

  toggleMenu(postId: string) {
    this.activeMenuId.update(id => id === postId ? null : postId);
  }

  // ─── Image Carousel State ──────────────────────────────────────────────
  activeImageIndex = signal<Record<string, number>>({});

  onImageScroll(postId: string, event: Event) {
    const target = event.target as HTMLElement;
    // We calculate index based on scrollLeft divided by the width of the container. 
    // Since images are 100% width minus padding, and gap is 8px, scrollWidth/children is roughly one image width.
    const scrollLeft = target.scrollLeft;
    const clientWidth = target.clientWidth;
    // Estimate image width (taking padding into account roughly)
    const index = Math.round(scrollLeft / (clientWidth - 32));
    
    // Only update if changed to avoid unnecessary change detection cycles
    const current = this.activeImageIndex()[postId] || 0;
    if (current !== index) {
      this.activeImageIndex.update(m => ({ ...m, [postId]: index }));
    }
  }

  getActiveImageIndex(postId: string): number {
    return this.activeImageIndex()[postId] || 0;
  }


  // ─── Add Member modal state ───────────────────────────────────────────
  readonly addMemberOpen = signal(false);
  newMemberName = '';
  newMemberEmail = '';
  readonly isInviting = signal(false);
  readonly inviteStatus = signal('');
  readonly inviteSuccess = signal(false);

  // ─── Edit Member modal state ──────────────────────────────────────────
  readonly editMemberOpen = signal(false);
  editingMember: Member | null = null;
  editMemberName = '';
  editMemberEmail = '';
  readonly isSavingMember = signal(false);

  // Expense form state
  expForm: { desc: string; amount: number; category: string; payerId: string; date: string } = {
    desc: '', amount: 0, category: 'OTHER', payerId: '', date: new Date().toISOString().split('T')[0]
  };
  
  // Split logic state
  readonly includedMembers = signal<Record<string, boolean>>({});
  readonly lockedShares = signal<Record<string, number | null>>({});
  readonly editingMemberId = signal<string | null>(null);

  get formattedTotalAmount(): string {
    return this.expForm.amount ? this.formatNumber(this.expForm.amount) : '';
  }

  setTotalAmount(val: string) {
    const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
    this.expForm.amount = isNaN(parsed) ? 0 : parsed;
  }

  toggleMember(id: string) {
    this.includedMembers.update(m => ({ ...m, [id]: !m[id] }));
    if (!this.includedMembers()[id]) {
       this.lockedShares.update(m => ({ ...m, [id]: null })); 
    }
  }

  startEdit(memberId: string) {
    this.editingMemberId.set(memberId);
  }

  setLockedAmount(memberId: string, value: string) {
    this.editingMemberId.set(null);
    const val = value.trim();
    if (!val) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      return;
    }
    let num = 0;
    if (val.endsWith('%')) {
      num = (this.expForm.amount || 0) * (parseFloat(val) / 100);
    } else {
      num = parseFloat(val.replace(/[^0-9.]/g, ''));
    }
    if (isNaN(num)) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
    } else {
      this.lockedShares.update(m => ({ ...m, [memberId]: Math.round(num) }));
    }
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    const lockedAmount = this.lockedShares()[memberId];
    if (lockedAmount !== undefined && lockedAmount !== null) return lockedAmount;

    const total = this.expForm.amount || 0;
    let totalLocked = 0;
    let floatCount = 0;

    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l !== undefined && l !== null) totalLocked += l;
        else floatCount++;
      }
    });

    let remainder = total - totalLocked;
    return floatCount > 0 ? Math.round(Math.max(0, remainder) / floatCount) : 0;
  }

  onInputSplitAmount(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      input.value = num.toLocaleString('en-US');
    } else {
      input.value = '';
    }
  }

  readonly categories = Object.entries(CATEGORY_META).map(([id, v]) => ({
    id, emoji: v.emoji, label: v.label
  }));

  // ─── Derived State ────────────────────────────────────────────────────────
  readonly tripId = signal('');
  readonly currentUserId = computed(() => this.travelStore.currentUserId());

  readonly trip = computed<Trip | null>(() => {
    const id = this.tripId();
    return this.travelStore.trips().find(t => t.id === id) ?? null;
  });

  readonly isOwner = computed(() => {
    const t = this.trip();
    return t?.ownerId === this.currentUserId();
  });

  readonly isMember = computed(() => {
    const t = this.trip();
    if (!t) return false;
    return t.members?.some(m => m.id === this.currentUserId()) ?? false;
  });

  readonly tripExpenses = computed<Expense[]>(() =>
    this.travelStore.expenses().filter(e => e['tripId'] === this.tripId())
  );

  readonly tripPosts = computed<Post[]>(() =>
    this.travelStore.posts().filter(p => p.tripId === this.tripId())
  );

  readonly tripPostsGroups = computed(() => {
    const posts = this.tripPosts();
    const groups: { dateLabel: string; posts: Post[] }[] = [];
    const map = new Map<string, Post[]>();
    
    posts.forEach(p => {
      // Use device local string without year for cleaner look
      const dateStr = new Date(p.timestamp).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      });
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(p);
    });

    map.forEach((pts, dateLabel) => {
      groups.push({ dateLabel, posts: pts });
    });

    return groups;
  });

  readonly totalTripCost = computed(() =>
    this.tripExpenses().reduce((sum, e) => sum + e.amount, 0)
  );

  readonly yourShare = computed(() => {
    const uid = this.currentUserId();
    const members = this.trip()?.members?.length || 1;
    return this.tripExpenses().reduce((sum, e) => {
      if (e.splits && Object.keys(e.splits).length > 0) {
        return sum + (e.splits[uid] || 0);
      }
      return sum + Math.round(e.amount / members);
    }, 0);
  });

  readonly chartData = computed(() => {
    const totals: Record<string, number> = {};
    let grand = 0;
    this.tripExpenses().forEach(e => {
      const cat = e.category || 'OTHER';
      totals[cat] = (totals[cat] || 0) + e.amount;
      grand += e.amount;
    });
    if (!grand) return [];
    return Object.entries(totals).map(([category, amount]) => ({
      category,
      amount,
      percent: (amount / grand) * 100,
      color: CATEGORY_META[category]?.color || '#9CA3AF'
    })).sort((a, b) => b.amount - a.amount);
  });

  readonly debts = computed<Debt[]>(() => {
    const expenses = this.tripExpenses();
    const members = this.trip()?.members || [];
    if (!members.length) return [];

    const balance: Record<string, number> = {};
    members.forEach(m => balance[m.id] = 0);

    expenses.forEach(exp => {
      const paidAmount = exp.amount;
      balance[exp.payerId] = (balance[exp.payerId] || 0) + paidAmount;
      if (exp.splits && Object.keys(exp.splits).length > 0) {
        Object.entries(exp.splits).forEach(([uid, share]) => {
          balance[uid] = (balance[uid] || 0) - (share as number);
        });
      } else {
        const share = paidAmount / members.length;
        members.forEach(m => {
          balance[m.id] = (balance[m.id] || 0) - share;
        });
      }
    });

    const creditors = Object.entries(balance).filter(([, v]) => v > 1).map(([id, v]) => ({ id, amount: v }));
    const debtors   = Object.entries(balance).filter(([, v]) => v < -1).map(([id, v]) => ({ id, amount: -v }));

    // Sort by largest debts/credits first for efficient greedy matching
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const result: Debt[] = [];
    
    let i = 0; // debtors index
    let j = 0; // creditors index

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settled = Math.min(debtor.amount, creditor.amount);

      if (settled > 0) {
        const fromMember = members.find(m => m.id === debtor.id);
        const toMember = members.find(m => m.id === creditor.id);
        
        result.push({
          fromId: debtor.id, fromName: fromMember?.name || debtor.id,
          toId: creditor.id, toName: toMember?.name || creditor.id,
          amount: Math.round(settled)
        });
      }

      debtor.amount -= settled;
      creditor.amount -= settled;

      if (debtor.amount < 1) i++;
      if (creditor.amount < 1) j++;
    }

    return result;
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.tripId.set(id);

    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && this.tabs.includes(tab)) this.activeTab = tab;

    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }

    // Load isolated dependencies for this trip guaranteeing consistency regardless of Realtime dropouts
    await this.loadExpenses();
    await this.loadPosts();

    // Set default payer to current user
    this.expForm.payerId = this.currentUserId();
  }

  private async loadExpenses() {
    const db = this.supabaseService.client;
    const { data } = await db.from('expenses').select('*').eq('trip_id', this.tripId()).order('created_at', { ascending: false });
    if (data) {
      data.forEach((row: any) => {
        const expense: Expense = {
          id: row.id,
          tripId: row.trip_id,
          desc: row.desc,
          amount: row.amount,
          category: row.category,
          payerId: row.payer_id,
          date: row.date,
          splits: row.splits || {}
        };
        this.travelStore.upsertExpense(expense);
      });
    }
  }

  private async loadPosts() {
    const db = this.supabaseService.client;
    const { data } = await db.from('posts').select('*').eq('trip_id', this.tripId()).order('created_at', { ascending: false });
    if (data) {
      const trip = this.trip();
      data.forEach((p: any) => {
        const author = trip?.members?.find(m => m.id === p.user_id);
        let parsedLikes = p.likes;
        if (typeof parsedLikes === 'string') {
          try { parsedLikes = JSON.parse(parsedLikes); } catch (e) { parsedLikes = []; }
        }
        if (!Array.isArray(parsedLikes)) parsedLikes = [];

        let parsedComments = p.comments;
        if (typeof parsedComments === 'string') {
          try { parsedComments = JSON.parse(parsedComments); } catch (e) { parsedComments = []; }
        }
        if (!Array.isArray(parsedComments)) parsedComments = [];

        let parsedImages = p.image_urls;
        if (typeof parsedImages === 'string') {
          try { parsedImages = JSON.parse(parsedImages); } catch (e) { parsedImages = []; }
        }
        if (!Array.isArray(parsedImages)) parsedImages = [];

        const post: Post = {
          id: p.id,
          tripId: p.trip_id,
          authorId: p.user_id,
          authorName: author?.name || 'Traveler',
          authorAvatar: author?.avatar,
          content: p.content || '',
          images: parsedImages,
          isDual: p.is_dual_camera || false,
          timestamp: p.created_at || new Date().toISOString(),
          date: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          likes: parsedLikes.length,
          hasLiked: parsedLikes.includes(this.currentUserId()),
          comments: parsedComments
        };
        // Update local store ensuring we overwrite stale with fresh HTTP data
        this.travelStore.updatePost(post.id, post);
        if (!this.travelStore.posts().find(existing => existing.id === post.id)) {
           this.travelStore.addPost(post);
        }
      });
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  goBack() { this.router.navigate(['/trips']); }

  animationDirection = 'slide-fade-in';
  animationTrigger = true;

  setTab(tab: string) { 
    const currentIndex = this.tabs.indexOf(this.activeTab);
    const nextIndex = this.tabs.indexOf(tab);
    if (currentIndex === nextIndex) return;

    this.animationDirection = nextIndex > currentIndex ? 'slide-left' : 'slide-right';
    this.animationTrigger = false;
    this.activeTab = tab; 

    // small delay to force DOM reflow and restart CSS animation
    setTimeout(() => {
      this.animationTrigger = true;
    }, 10);
  }

  navigateToAddMoment() {
    this.router.navigate(['/add-moment'], { queryParams: { tripId: this.tripId() } });
  }

  // ─── Swipe Gestures ────────────────────────────────────────────────────────
  touchStartX = 0;
  touchEndX = 0;
  touchStartY = 0;
  touchEndY = 0;
  
  onTouchStart(e: TouchEvent) {
    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
  }
  
  onTouchEnd(e: TouchEvent) {
    this.touchEndX = e.changedTouches[0].screenX;
    this.touchEndY = e.changedTouches[0].screenY;
    this.handleSwipe();
  }
  
  handleSwipe() {
    const swipeDistanceX = this.touchEndX - this.touchStartX;
    const swipeDistanceY = this.touchEndY - this.touchStartY;
    
    // Only register as horizontal swipe if distance X is greater than Y and meets threshold
    if (Math.abs(swipeDistanceX) > 60 && Math.abs(swipeDistanceX) > Math.abs(swipeDistanceY)) {
      const currentIndex = this.tabs.indexOf(this.activeTab);
      if (swipeDistanceX < 0) {
        // swipe left -> next tab
        if (currentIndex < this.tabs.length - 1) {
          this.setTab(this.tabs[currentIndex + 1]);
        }
      } else {
        // swipe right -> prev tab
        if (currentIndex > 0) {
          this.setTab(this.tabs[currentIndex - 1]);
        }
      }
    }
  }

  // ─── Social ───────────────────────────────────────────────────────────────
  async toggleLike(postId: string) {
    if (!this.isMember()) return;
    const db = this.supabaseService.client;
    const uid = this.currentUserId();
    const post = this.tripPosts().find(p => p.id === postId);
    if (!post) return;

    // Optimistic update (local UI)
    const newLiked = !post.hasLiked;
    const newLikes = newLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
    this.travelStore.updatePost(postId, { hasLiked: newLiked, likes: newLikes });

    this.travelStore.setGlobalLoading(true);
    try {
      const { data, error } = await db
        .from('posts').select('likes').eq('id', postId).single();
      if (error) throw error;

      let currentLikes: string[] = [];
      if (data && data['likes']) {
        const raw = data['likes'];
        if (Array.isArray(raw)) {
          currentLikes = raw;
        } else if (typeof raw === 'string') {
          try { currentLikes = JSON.parse(raw); } catch (e) { currentLikes = []; }
        }
      }
      
      const userIndex = currentLikes.indexOf(uid);
      let updatedLikes: string[];

      if (newLiked) {
        updatedLikes = userIndex === -1 ? [...currentLikes, uid] : currentLikes;
      } else {
        updatedLikes = currentLikes.filter(id => id !== uid);
      }

      const { error: updateError } = await db
        .from('posts').update({ likes: updatedLikes }).eq('id', postId);
      if (updateError) throw updateError;

      this.travelStore.updatePost(postId, {
        hasLiked: updatedLikes.includes(uid),
        likes: updatedLikes.length
      });
    } catch (err: any) {
      this.travelStore.updatePost(postId, { hasLiked: post.hasLiked, likes: post.likes });
      console.error('toggleLike failed:', err);
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  openComments(post: Post) {
    this.commentPostId.set(post.id);
    this.commentText = '';
  }

  closeComments() {
    this.commentPostId.set(null);
    this.commentText = '';
  }

  async sendComment() {
    const text = this.commentText.trim();
    const activePost = this.activeCommentPost();
    if (!text || !activePost) return;
    
    this.isSendingComment.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const uid = this.travelStore.currentUserId();
      const profile = this.travelStore.currentUserProfile();
      const member = this.trip()?.members.find(m => m.id === uid);
      const authorName = profile?.name || member?.name || 'Traveler';

      const newComment: Comment = {
        id: crypto.randomUUID(),
        authorId: uid,
        authorName,
        authorAvatar: profile?.avatar || undefined,
        text,
        timestamp: new Date().toISOString()
      };

      const existingComments = activePost.comments || [];
      const updatedComments = [...existingComments, newComment];

      // Optimistic local state update
      this.travelStore.updatePost(activePost.id, { comments: updatedComments });
      this.commentText = '';

      // Update Supabase using RPC to avoid race conditions on JSONB arrays
      const db = this.supabaseService.client;
      const { error } = await db.rpc('add_post_comment', {
        p_post_id: activePost.id,
        p_comment: newComment
      });
      
      if (error) {
        // Fallback to traditional update if RPC is not available in the database yet
        console.warn('RPC failed, falling back to full array replace:', error);

        // Fetch the absolute latest `comments` array from the database just before we flush to avoid overwriting someone else's concurrent comment.
        const { data: freshPost } = await db.from('posts').select('comments').eq('id', activePost.id).single();
        
        let freshComments = [];
        if (freshPost) {
          const raw = freshPost['comments'];
          if (Array.isArray(raw)) {
            freshComments = raw;
          } else if (typeof raw === 'string') {
            try { freshComments = JSON.parse(raw); } catch (e) { freshComments = []; }
          }
        }
        
        const safelyMergedComments = [...freshComments, newComment];
        await db.from('posts').update({ comments: safelyMergedComments }).eq('id', activePost.id);
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to send comment.', 'error');
    } finally {
      this.isSendingComment.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deletePost(postId: string) {
    const confirmed = await this.confirmService.confirm('Delete this post?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    const post = this.tripPosts().find(p => p.id === postId);
    this.travelStore.setGlobalLoading(true);
    try {
      // 1. Collect Storage paths before deletion
      const pathsToDelete = (post?.images || [])
        .filter(url => url && url.includes('/nomadsync-media/'))
        .map(url => url.split('/nomadsync-media/')[1]);

      // 2. Clear image_urls first to bypass Postgres storage triggers
      if (pathsToDelete.length > 0) {
        await db.from('posts').update({ image_urls: null }).eq('id', postId);
      }

      // 3. Delete the post row
      const { error } = await db.from('posts').delete().eq('id', postId);
      if (error) throw error;

      // 4. Remove orphaned files from Storage bucket
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }

      // 5. Update local store
      this.travelStore.removePost(postId);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete post.', 'error');
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Edit Post ────────────────────────────────────────────────────────────
  openEditPost(post: Post) {
    this.editPostObj = post;
    this.editPostContent = post.content || '';
    this.editPostOpen.set(true);
  }

  async saveEditPost() {
    if (!this.editPostObj) return;
    const db = this.supabaseService.client;
    this.isSavingPost.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const { error } = await db
        .from('posts')
        .update({ content: this.editPostContent })
        .eq('id', this.editPostObj.id);

      if (error) throw error;

      this.travelStore.updatePost(this.editPostObj.id, { content: this.editPostContent });
      this.editPostOpen.set(false);
      this.editPostObj = null;
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to edit post.', 'error');
    } finally {
      this.isSavingPost.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Share Post ───────────────────────────────────────────────────────────
  async sharePost(post: Post) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `WanderPool Moment: ${post.authorName}`,
          text: post.content || 'Check out this moment on WanderPool!',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    } else {
      // Fallback for browsers that don't support the Web Share API (copy to clipboard)
      try {
        await navigator.clipboard.writeText(window.location.href);
        this.toastService.show('Link copied to clipboard!', 'success');
      } catch (err) {
        this.toastService.show('Failed to copy link. Please manually copy the URL.', 'error');
      }
    }
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  openExpenseModal() {
    this.editingExpense = null;
    this.expForm = { desc: '', amount: 0, category: 'FOOD', payerId: this.currentUserId(), date: new Date().toISOString().split('T')[0] };
    const inc: Record<string, boolean> = {};
    const trip = this.trip();
    if (trip) trip.members.forEach(m => inc[m.id] = true);
    this.includedMembers.set(inc);
    this.lockedShares.set({});
    this.expenseModalOpen.set(true);
  }

  openExpenseDetail(exp: Expense) { this.selectedExpense = exp; }

  editExpense(exp: Expense) {
    this.editingExpense = exp;
    this.expForm = { desc: exp.desc, amount: exp.amount, category: exp.category || 'FOOD', payerId: exp.payerId, date: exp.date };
    const inc: Record<string, boolean> = {};
    const lock: Record<string, number | null> = {};
    const trip = this.trip();
    if (trip) {
      if (exp.splits && Object.keys(exp.splits).length > 0) {
        trip.members.forEach(m => {
          const share = exp.splits![m.id];
          if (share !== undefined && share > 0) {
            inc[m.id] = true;
            // Best effort state reconstruction: keep previous exact values as locked if edited
            lock[m.id] = share;
          } else {
            inc[m.id] = false;
          }
        });
      } else {
        trip.members.forEach(m => inc[m.id] = true);
      }
    }
    this.includedMembers.set(inc);
    this.lockedShares.set(lock);
    this.selectedExpense = null;
    this.expenseModalOpen.set(true);
  }

  async saveExpense() {
    if (!this.expForm.desc || !this.expForm.amount) return;
    this.isSavingExpense.set(true);
    this.travelStore.setGlobalLoading(true);

    const db = this.supabaseService.client;
    const splits: Record<string, number> = {};
    let totalAssigned = 0;
    let lastMemberId: string | null = null;
    const trip = this.trip();
    
    if (trip) {
      trip.members.forEach(m => {
        if (this.includedMembers()[m.id]) {
          const share = this.calcShare(m.id);
          splits[m.id] = share;
          totalAssigned += share;
          lastMemberId = m.id;
        }
      });
    }

    if (lastMemberId && totalAssigned !== this.expForm.amount) {
       splits[lastMemberId] += (this.expForm.amount - totalAssigned);
    }

    const payload: any = {
      trip_id: this.tripId(),
      description: this.expForm.desc,
      amount: this.expForm.amount,
      category: this.expForm.category,
      payer_id: this.expForm.payerId,
      splits
    };
    
    if (this.expForm.date) {
      // Append time so it's a valid timestamp
      payload.created_at = new Date(this.expForm.date).toISOString();
    }

    try {
      if (this.editingExpense) {
        const { data, error } = await db.from('expenses').update(payload).eq('id', this.editingExpense.id).select().single();
        if (error) throw error;
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['description'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['date'], splits: data['splits']
        } as Expense);
      } else {
        const { data, error } = await db.from('expenses').insert(payload).select().single();
        if (error) throw error;
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['description'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['date'], splits: data['splits']
        } as Expense);
      }
      this.expenseModalOpen.set(false);
      this.editingExpense = null;
    } catch (err: any) {
      console.error('Save Expense Error:', err);
      this.toastService.show(err.message || 'Failed to save expense', 'error');
    } finally {
      this.isSavingExpense.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deleteExpenseConfirm(expId: string) {
    const confirmed = await this.confirmService.confirm('Delete this expense?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    const { error } = await db.from('expenses').delete().eq('id', expId);
    if (!error) {
      this.travelStore.removeExpense(expId);
      this.selectedExpense = null;
    }
  }

  // ─── Members ──────────────────────────────────────────────────────────────
  openAddMemberModal() {
    this.newMemberName = '';
    this.newMemberEmail = '';
    this.inviteStatus.set('');
    this.addMemberOpen.set(true);
  }

  async inviteMember() {
    const name = this.newMemberName.trim();
    const email = this.newMemberEmail.trim();

    if (!name) { this.setInviteError('Please enter the member\'s name.'); return; }
    if (!email || !email.includes('@')) { this.setInviteError('Please enter a valid email address.'); return; }

    this.isInviting.set(true);
    this.inviteStatus.set('');
    this.travelStore.setGlobalLoading(true);

    const db = this.supabaseService.client;
    const trip = this.trip();
    if (!trip) { this.isInviting.set(false); return; }

    try {
      // 1. Try to find user by email in `users` table
      let userId: string | null = null;
      const { data: userData } = await db
        .from('users')
        .select('id, name')
        .eq('email', email)
        .maybeSingle();

      if (userData) {
        userId = userData['id'];
      }

      // 2. Try Edge Function (best-effort - may not exist in all envs)
      if (!userId) {
        try {
          const { data: fnData } = await db.functions.invoke('invite-member', {
            body: { email }
          });
          if (fnData?.userId) userId = fnData.userId;
        } catch { /* Edge function optional */ }
      }

      // 3. Build member object (use found userId or generate temp ID)
      const finalId = userId || window.crypto.randomUUID();
      const alreadyMember = trip.members.some(m => m.id === finalId || m.email === email);

      if (alreadyMember) {
        this.setInviteError('This person is already a member of the trip.');
        return;
      }

      const newMember: Member = {
        id: finalId,
        name,
        email,
        isMe: false
      };


      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }
      const updatedMembers = [...dbMembers, newMember];

      // 4. Update Supabase trip record
      const { error } = await db
        .from('trips')
        .update({ members: updatedMembers })
        .eq('id', trip.id);

      if (error) throw error;

      // 5. Update local store
      this.travelStore.updateTrip(trip.id, { members: updatedMembers });

      // 6. Success
      this.inviteSuccess.set(true);
      this.inviteStatus.set(`✅ ${name} has been added to the trip!`);
      this.newMemberName = '';
      this.newMemberEmail = '';

      // Close after short delay
      setTimeout(() => {
        this.addMemberOpen.set(false);
        this.inviteStatus.set('');
      }, 1500);
    } catch (err: any) {
      this.setInviteError(err.message || 'Failed to add member. Please try again.');
    } finally {
      this.isInviting.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  private setInviteError(msg: string) {
    this.inviteSuccess.set(false);
    this.inviteStatus.set(msg);
  }

  // ─── Edit Member ──────────────────────────────────────────────────────────
  openEditMember(member: Member) {
    this.editingMember = member;
    this.editMemberName = member.name || '';
    this.editMemberEmail = member.email || '';
    this.editMemberOpen.set(true);
  }

  async saveEditMember() {
    const name = this.editMemberName.trim();
    const email = this.editMemberEmail.trim();

    if (!name || !this.editingMember) return;
    this.isSavingMember.set(true);
    this.travelStore.setGlobalLoading(true);

    const trip = this.trip();
    if (!trip) return;

    try {
      const db = this.supabaseService.client;
      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }

      const updatedMember: Member = { ...this.editingMember, name, email };
      const newMembers = dbMembers.map(m => m.id === updatedMember.id ? updatedMember : m);

      const { error } = await db.from('trips').update({ members: newMembers }).eq('id', trip.id);
      if (error) throw error;

      this.travelStore.updateTrip(trip.id, { members: newMembers });
      this.editMemberOpen.set(false);
      this.editingMember = null;
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to update member.', 'error');
    } finally {
      this.isSavingMember.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async removeMember(memberId: string) {
    const confirmed = await this.confirmService.confirm('Remove this member?');
    if (!confirmed) return;
    const trip = this.trip();
    if (!trip) return;
    const db = this.supabaseService.client;

    // Fetch latest members to prevent race condition
    const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
    let dbMembers = trip.members;
    if (freshTrip && freshTrip.members) {
       let raw = freshTrip.members;
       if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
       if (Array.isArray(raw)) dbMembers = raw;
    }

    const updated = dbMembers.filter((m: any) => m.id !== memberId);
    await db.from('trips').update({ members: updated }).eq('id', trip.id);
    this.travelStore.updateTrip(trip.id, { members: updated });
  }

  // ─── Delete Trip ───────────────────────────────────────────────────────────
  async confirmDelete() {
    const confirmed = await this.confirmService.confirm('Delete this adventure permanently? This cannot be undone.');
    if (!confirmed) return;
    try {
      // Delegates to TravelStore.deleteTrip() which handles full Storage GC:
      // 1. Collect all media URLs (cover + expense receipts + post images)
      // 2. Clear image_urls/receipt_urls/cover_image before delete (bypass triggers)
      // 3. Delete trip row
      // 4. Remove orphaned files from 'nomadsync-media' bucket
      // 5. Remove cascaded expenses+posts from local signals
      await this.travelStore.deleteTrip(this.tripId());
      this.router.navigate(['/trips']);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete trip. Please try again.', 'error');
    }
  }

  async publishTrip() {
    const isCurrentlyPrivate = this.trip()?.isPrivate ?? true;
    const actionText = isCurrentlyPrivate ? 'publish' : 'unpublish';
    const confirmMessage = isCurrentlyPrivate 
      ? 'Are you sure you want to publish this trip to the Discover feed?'
      : 'Are you sure you want to hide this trip from the Discover feed?';

    const confirmed = await this.confirmService.confirm(confirmMessage);
    if (!confirmed) return;
    
    this.travelStore.setGlobalLoading(true);
    
    try {
      const db = this.supabaseService.client;
      const { error } = await db
        .from('trips')
        .update({ is_private: !isCurrentlyPrivate })
        .eq('id', this.tripId());

      if (error) throw error;
      
      this.travelStore.updateTrip(this.tripId(), { isPrivate: !isCurrentlyPrivate });
      
      // Broadcast to other devices to bypass RLS missing-event bug
      this.travelStore.broadcastRefresh();
      
      if (isCurrentlyPrivate) {
        this.toastService.show('Your amazing adventure is now live on the Discover feed! 🌍', 'success');
      } else {
        this.toastService.show('Trip has been hidden from the Discover feed.', 'success');
      }
    } catch (err: any) {
      this.toastService.show(err.message || `Failed to ${actionText} trip.`, 'error');
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  exportExcel() {
    const trip = this.trip();
    if (!trip) return;
    const members = trip.members;

    const wb = XLSX.utils.book_new();

    // --- SHEET 1: SUMMARY ---
    const summaryData = [
      ['THÔNG TIN DỰ ÁN (TRIP SUMMARY)'],
      ['Tên chuyến đi', trip.title],
      ['Thời gian', `${this.formatDate(trip.startDate)} - ${this.formatDate(trip.endDate)}`],
      ['Tổng số thành viên', members.length],
      ['Tổng chi phí chuyến đi', this.totalTripCost()],
      ['Tổng số hóa đơn', this.tripExpenses().length]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Helper for safely getting share
    const getShare = (mId: string, e: Expense) => {
      if (e.splits && Object.keys(e.splits).length > 0) {
        return e.splits[mId] || 0;
      }
      return this.getFallbackSplit(e);
    };

    // --- SHEET 2: CHI_TIẾT CÁ NHÂN ---
    const chiTietData: any[] = [];
    chiTietData.push(['Tên người tham gia', 'Tên khoản chi', 'Ngày', 'Người thanh toán (Paid By)', 'Số tiền chịu (Share)']);
    members.forEach(m => {
      this.tripExpenses().forEach(e => {
         const share = getShare(m.id, e);
         if (share > 0) {
           chiTietData.push([m.name, e.desc, this.formatDate(e.date), this.getPayerName(e.payerId), share]);
         }
      });
    });
    const wsChiTiet = XLSX.utils.aoa_to_sheet(chiTietData);
    XLSX.utils.book_append_sheet(wb, wsChiTiet, 'Chi Tiết Cá Nhân');

    // --- SHEET 3: DANH SÁCH HÓA ĐƠN ---
    const hoaDonData: any[] = [];
    hoaDonData.push(['Tên khoản chi', 'Ngày', 'Danh mục', 'Người thanh toán (Paid By)', 'Tổng tiền', 'Kiểu chia', 'Chi tiết chia định mức']);
    this.tripExpenses().forEach(e => {
      const participantsDetail: string[] = [];
      let isEven = true;
      
      members.forEach(m => {
        const share = getShare(m.id, e);
        if (share > 0) {
           participantsDetail.push(`${m.name} (${this.formatNumber(share)}đ)`);
        }
      });
      
      if (e.splits && Object.keys(e.splits).length > 0) {
         const amtValues = Object.values(e.splits).filter(v => typeof v === 'number' && v > 0);
         if (amtValues.length > 0) {
           const max = Math.max(...amtValues);
           const min = Math.min(...amtValues);
           if (max - min > 50) isEven = false;
         }
      }
      
      const splitType = isEven ? 'Chia đều' : 'Chia tùy chỉnh';
      hoaDonData.push([e.desc, this.formatDate(e.date), this.getCategoryLabel(e.category||'OTHER'), this.getPayerName(e.payerId), e.amount, splitType, participantsDetail.join('; ')]);
    });
    const wsHoaDon = XLSX.utils.aoa_to_sheet(hoaDonData);
    XLSX.utils.book_append_sheet(wb, wsHoaDon, 'Danh Sách Hóa Đơn');

    // --- SHEET 4: TỔNG KẾT TÀI CHÍNH ---
    const overallData: any[] = [];
    overallData.push(['Tên người tham gia', 'Tổng đã chi (Paid)', 'Tổng thực tiêu (Share)', 'Thừa / Thiếu (Balance)', 'Chi tiết Thanh toán']);
    const debtsList = this.debts();
    members.forEach(m => {
       const totalPaid = this.tripExpenses().filter(e => e.payerId === m.id).reduce((sum, e) => sum + e.amount, 0);
       const totalShare = this.tripExpenses().reduce((sum, e) => {
          return sum + getShare(m.id, e);
       }, 0);
       const balance = totalPaid - totalShare;
       
       const memberDebts = debtsList.filter(d => d.fromId === m.id);
       const memberCredits = debtsList.filter(d => d.toId === m.id);
       
       const debtStrings: string[] = [];
       memberDebts.forEach(d => debtStrings.push(`Thiếu trả cho ${d.toName}: ${this.formatNumber(d.amount)}đ`));
       memberCredits.forEach(c => debtStrings.push(`Nhận lại từ ${c.fromName}: ${this.formatNumber(c.amount)}đ`));
       if (debtStrings.length === 0 && balance === 0) debtStrings.push('Vừa vặn (Không nợ)');
       
       overallData.push([m.name, totalPaid, totalShare, balance, debtStrings.join(' | ')]);
    });
    const wsOverall = XLSX.utils.aoa_to_sheet(overallData);
    XLSX.utils.book_append_sheet(wb, wsOverall, 'Tổng Kết Tài Chính');

    // Tải file về thiết bị
    XLSX.writeFile(wb, `${trip.title}_Financial_Report.xlsx`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getPayerName(payerId: string): string {
    return this.trip()?.members.find(m => m.id === payerId)?.name || 'Someone';
  }

  getCategoryEmoji(cat: string): string { return CATEGORY_META[cat]?.emoji || '💸'; }
  getCategoryLabel(cat: string): string { return CATEGORY_META[cat]?.label || 'Other'; }
  getCategoryBg(cat: string): string    { return CATEGORY_META[cat]?.bg    || '#F3F4F6'; }

  getFallbackSplit(exp: Expense): number {
    const membersCount = this.trip()?.members.length || 1;
    return Math.round(exp.amount / membersCount);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatRelative(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  formatCurrency(val: number): string { return `₫${val.toLocaleString('en-US')}`; }
  formatNumber(val: number): string   { return val.toLocaleString('en-US'); }

  getAvatarBg(name: string): string {
    if (!name) return '#F3F4F6';
    const colors = ['#FEE2E2', '#FFEDD5', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#E0E7FF', '#EDE9FE', '#FCE7F3'];
    return colors[name.charCodeAt(0) % colors.length];
  }

  getAvatarColor(name: string): string {
    if (!name) return '#6B7280';
    const colors = ['#DC2626', '#EA580C', '#D97706', '#059669', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777'];
    return colors[name.charCodeAt(0) % colors.length];
  }
}
