import { Component, inject, signal, computed, OnInit, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Expense, Member, ExpenseCategory } from '../../core/models/expense.model';
import { Post, Comment } from '../../core/models/social.model';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MomentsComponent } from '../moments/moments.component';
import { SwipeToCloseDirective } from '../../shared/directives/swipe-to-close.directive';


import * as XLSX from 'xlsx';

export interface Debt {
  fromId: string; fromName: string; fromAvatar?: string;
  toId: string; toName: string; toAvatar?: string;
  amount: number;
}

export const CATEGORY_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  FOOD:       { emoji: '🍔', label: 'Food',        color: '#F59E0B', bg: '#FEF3C7' },
  TRANSPORT:  { emoji: '🚕', label: 'Transport',   color: '#3B82F6', bg: '#DBEAFE' },
  HOTEL:      { emoji: '🏨', label: 'Hotel',       color: '#8B5CF6', bg: '#EDE9FE' },
  ACTIVITIES: { emoji: '🎯', label: 'Activities',  color: '#10B981', bg: '#D1FAE5' },
  SHOPPING:   { emoji: '🛍️', label: 'Shopping',   color: '#EC4899', bg: '#FCE7F3' },
  SETTLEMENT: { emoji: '💸', label: 'Settlement',  color: '#10B981', bg: '#D1FAE5' },
  OTHER:      { emoji: '💳', label: 'Other',       color: '#6B7280', bg: '#F3F4F6' },
};

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { LowerCasePipe } from '@angular/common';
import { TripBalances } from './components/trip-balances/trip-balances';
import { TripExpensesComponent } from './components/trip-expenses/trip-expenses';
import { TripSocialComponent } from './components/trip-social/trip-social';
import { ExpenseModalComponent } from './components/modals/expense-modal/expense-modal';
import { SettleModalComponent } from './components/modals/settle-modal/settle-modal';
import { PostCommentsModalComponent } from './components/modals/post-comments-modal/post-comments-modal';
import { EditPostModalComponent } from './components/modals/edit-post-modal/edit-post-modal';
import { AddMemberModalComponent } from './components/modals/add-member-modal/add-member-modal';
import { EditMemberModalComponent } from './components/modals/edit-member-modal/edit-member-modal';
import { EditTripModalComponent } from './components/modals/edit-trip-modal/edit-trip-modal';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [FormsModule, MomentsComponent, SwipeToCloseDirective, TranslatePipe, LowerCasePipe, TripBalances, TripExpensesComponent, TripSocialComponent, ExpenseModalComponent, SettleModalComponent, PostCommentsModalComponent, EditPostModalComponent, AddMemberModalComponent, EditMemberModalComponent, EditTripModalComponent],
  templateUrl: './trip-detail.component.html',
  styleUrl: './trip-detail.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TripDetailComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  readonly defaultCover = 'https://images.unsplash.com/photo-1473496169904-6a58eb22bf2f?q=80&w=1000';

  readonly tabs = ['MOMENTS', 'SOCIAL', 'EXPENSES', 'BALANCES', 'MEMBERS', 'ACTIVITY'];
  activeTab = 'SOCIAL';
  quickPostMode = false;

  editTripModal = false;
  isCoverLoading = signal(false);

  openEditTrip() {
    this.editTripModal = true;
  }

  closeEditTrip() {
    this.editTripModal = false;
  }

  onCoverLoaded() {
    this.isCoverLoading.set(false);
  }



  // ─── Settlement state ──────────────────────────────────────────
  readonly settleModalOpen = signal(false);
  readonly settleDebt = signal<Debt | null>(null);
  
  openSettleModal(debt: Debt) {
    this.settleDebt.set(debt);
    this.settleModalOpen.set(true);
  }
  
  closeSettleModal() {
    this.settleModalOpen.set(false);
    this.settleDebt.set(null);
  }

  selectedExpense: Expense | null = null;

  readonly expenseModalOpen = signal(false);
  editingExpense: Expense | null = null;

  closeExpenseModal() {
    this.expenseModalOpen.set(false);
  }

  // ─── Comments modal state ──────────────────────────────────────────────
  readonly commentPostId = signal<string | null>(null);
  
  readonly activeCommentPost = computed(() => {
    const id = this.commentPostId();
    if (!id) return null;
    return this.tripPosts().find(p => p.id === id) || null;
  });

  // ─── Edit Post modal state ─────────────────────────────────────────────
  readonly editPostOpen = signal(false);
  editPostObj: Post | null = null;

  // ─── Add Member modal state ───────────────────────────────────────────
  readonly addMemberOpen = signal(false);
  newMemberName = '';
  newMemberEmail = '';
  readonly isInviting = signal(false);
  readonly inviteStatus = signal('');
  readonly inviteSuccess = signal(false);

  async closeAddMember() {
    if (this.newMemberName.trim() || this.newMemberEmail.trim()) {
      if (await this.confirmService.confirm(this.translationService.translate('modal.unsavedInfo'), this.translationService.translate('modal.warning'), this.translationService.translate('action.close'), this.translationService.translate('action.continue'))) {
        this.addMemberOpen.set(false);
      }
    } else {
      this.addMemberOpen.set(false);
    }
  }

  // ─── Edit Member modal state ──────────────────────────────────────────
  readonly editMemberOpen = signal(false);
  editingMember: Member | null = null;
  editMemberName = '';
  editMemberEmail = '';
  readonly isSavingMember = signal(false);

  // ─── Derived State ────────────────────────────────────────────────────────
  readonly tripId = signal('');
  readonly currentUserId = computed(() => this.travelStore.currentUserId());

  readonly trip = computed<Trip | null>(() => {
    const id = this.tripId();
    const t = this.travelStore.trips().find(t => t.id === id) ?? null;
    if (t && t.isPrivate) {
      const uid = this.currentUserId();
      if (!t.members?.some(m => m.id === uid)) {
        return null;
      }
    }
    return t;
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

  readonly tripExpenses = computed<Expense[]>(() => {
    return this.travelStore.expenses()
      .filter(e => e['tripId'] === this.tripId())
      .map(e => e.splits?.['__isSettlement'] ? { ...e, category: 'SETTLEMENT' as ExpenseCategory } : e)
      .sort((a, b) => {
        // Sort by createdAt if available, otherwise by date descending
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return timeB - timeA;
      });
  });

  readonly tripActivities = computed(() => {
    return this.travelStore.activityLogs()
      .filter(a => a.tripId === this.tripId())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  readonly activeBalanceFilter = signal<'ALL' | 'MINE'>('ALL');

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
    this.tripExpenses().reduce((sum, e) => sum + (e.category === 'SETTLEMENT' ? 0 : e.amount), 0)
  );

  readonly yourShare = computed(() => {
    const uid = this.currentUserId();
    const members = this.trip()?.members?.length || 1;
    return this.tripExpenses().reduce((sum, e) => {
      if (e.category === 'SETTLEMENT') return sum;
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
        return sum + (e.splits[uid] || 0);
      }
      return sum + Math.round(e.amount / members);
    }, 0);
  });

  readonly chartData = computed(() => {
    const totals: Record<string, number> = {};
    let grand = 0;
    this.tripExpenses().forEach(e => {
      if (e.category === 'SETTLEMENT') return;
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
      if (exp.splits && Object.keys(exp.splits).filter(k => !k.startsWith('__')).length > 0) {
        Object.entries(exp.splits).forEach(([uid, share]) => {
          if (!uid.startsWith('__')) {
            balance[uid] = (balance[uid] || 0) - (share as number);
          }
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
          fromId: debtor.id, fromName: fromMember?.name || debtor.id, fromAvatar: fromMember?.avatar,
          toId: creditor.id, toName: toMember?.name || creditor.id, toAvatar: toMember?.avatar,
          amount: Math.round(settled)
        });
      }

      debtor.amount -= settled;
      creditor.amount -= settled;

      if (debtor.amount < 1) i++;
      if (creditor.amount < 1) j++;
    }

    const uid = this.currentUserId();
    result.sort((a, b) => {
      const getRank = (d: Debt) => {
        if (d.toId === uid) return 1; // Current user receives
        if (d.fromId === uid) return 2; // Current user owes
        return 3; // Others
      };
      const rankA = getRank(a);
      const rankB = getRank(b);
      
      if (rankA !== rankB) return rankA - rankB;
      // Secondary sort: amount descending
      return b.amount - a.amount;
    });

    return result;
  });

  readonly totalYouOwe = computed(() => {
    const uid = this.currentUserId();
    return this.debts()
      .filter(d => d.fromId === uid)
      .reduce((sum, d) => sum + d.amount, 0);
  });

  readonly totalOwedToYou = computed(() => {
    const uid = this.currentUserId();
    return this.debts()
      .filter(d => d.toId === uid)
      .reduce((sum, d) => sum + d.amount, 0);
  });

  readonly displayDebts = computed(() => {
    const allDebts = this.debts();
    const filter = this.activeBalanceFilter();
    const uid = this.currentUserId();

    if (filter === 'MINE') {
      return allDebts.filter(d => d.fromId === uid || d.toId === uid);
    }
    return allDebts;
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

    if (!this.trip()) {
      this.toastService.show(this.translationService.translate('trip.notFound'), 'error');
      this.router.navigate(['/discover']);
      return;
    }

    // Load isolated dependencies for this trip guaranteeing consistency regardless of Realtime dropouts
    await this.loadExpenses();
    await this.loadPosts();
  }

  private async loadExpenses() {
    const db = this.supabaseService.client;
    const { data } = await db.from('expenses').select('*').eq('trip_id', this.tripId()).order('created_at', { ascending: false });
    if (data) {
      data.forEach((row: any) => {
        let parsedSplits = row.splits;
        if (typeof parsedSplits === 'string') {
          try { parsedSplits = JSON.parse(parsedSplits); } catch (e) { parsedSplits = {}; }
        }
        if (!parsedSplits || typeof parsedSplits !== 'object') parsedSplits = {};

        const expense: Expense = {
          id: row.id,
          tripId: row.trip_id,
          desc: row.description,
          amount: row.amount,
          category: row.category,
          payerId: row.payer_id,
          date: parsedSplits['__date'] || (row.created_at ? row.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10)),
          createdAt: row.created_at,
          splits: parsedSplits,
          receipts: row.receipt_urls || [],
          isEdited: !!parsedSplits['__isEdited']
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
  private _hasScrolledToInitialTab = false;
  private _tabCarousel!: ElementRef<HTMLDivElement>;

  @ViewChild('tabCarousel') 
  set tabCarousel(ref: ElementRef<HTMLDivElement>) {
    if (ref && !this._hasScrolledToInitialTab) {
      this._hasScrolledToInitialTab = true;
      setTimeout(() => {
        const el = ref.nativeElement;
        const index = this.tabs.indexOf(this.activeTab);
        if (index > 0) {
          el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' as ScrollBehavior });
          const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
          if (tabEl) tabEl.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' });
        }
      }, 100); // slight delay to ensure DOM is rendered and styled
    }
    this._tabCarousel = ref;
  }
  
  get tabCarousel(): ElementRef<HTMLDivElement> {
    return this._tabCarousel;
  }

  ngAfterViewInit() {
    // Scroll logic moved to tabCarousel setter to handle async rendering
  }

  setTab(tab: string) { 
    const currentIndex = this.tabs.indexOf(this.activeTab);
    const nextIndex = this.tabs.indexOf(tab);
    if (currentIndex === nextIndex) return;

    this.activeTab = tab; 
    
    // Smoothly scroll the tab header button into view
    const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    if (this.tabCarousel?.nativeElement) {
      const el = this.tabCarousel.nativeElement;
      el.scrollTo({ left: nextIndex * el.clientWidth, behavior: 'smooth' });
    }
  }

  onTabScroll(event: Event) {
    const el = event.target as HTMLElement;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (this.tabs[index] && this.activeTab !== this.tabs[index]) {
      this.activeTab = this.tabs[index];
      
      // Smoothly scroll the tab header button into view
      const tabEl = document.getElementById('tab-' + this.activeTab.toLowerCase());
      if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  navigateToAddMoment() {
    this.router.navigate(['/add-moment'], { queryParams: { tripId: this.tripId() } });
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
  }

  closeComments() {
    this.commentPostId.set(null);
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
    this.editPostOpen.set(true);
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
    this.expenseModalOpen.set(true);
  }

  openExpenseDetail(exp: Expense) { this.selectedExpense = exp; }

  // ─── Lightbox for viewing receipts ───────────────────────────────────────
  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);

  openLightbox(images: string[], index: number) {
    this.lightboxImages.set(images);
    this.lightboxIndex.set(index);
    setTimeout(() => {
      const container = document.querySelector('.lightbox-scroll') as HTMLElement;
      if (container) {
        container.scrollTo({ left: window.innerWidth * index, behavior: 'instant' });
      }
    }, 10);
  }
  
  onLightboxScroll(event: Event) {
    const el = event.target as HTMLElement;
    const idx = Math.round(el.scrollLeft / window.innerWidth);
    const imgs = this.lightboxImages();
    if (imgs && idx >= 0 && idx < imgs.length) {
      if (this.lightboxIndex() !== idx) {
        this.lightboxIndex.set(idx);
      }
    }
  }

  editExpense(exp: Expense) {
    this.editingExpense = exp;
    this.expenseModalOpen.set(true);
  }

  async deleteExpenseConfirm(expId: string) {
    const confirmed = await this.confirmService.confirm('Delete this expense?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    // Find the expense before deleting to log it
    const expenseToDelete = this.tripExpenses().find(e => e.id === expId);
    
    // 1. Collect Storage paths before deletion
    const pathsToDelete = (expenseToDelete?.receipts || [])
      .filter(url => url && url.includes('/nomadsync-media/'))
      .map(url => url.split('/nomadsync-media/')[1]);

    // 2. Clear receipt_urls first to bypass Postgres storage triggers (which block DELETE)
    if (pathsToDelete.length > 0) {
      await db.from('expenses').update({ receipt_urls: null }).eq('id', expId);
    }

    const { error } = await db.from('expenses').delete().eq('id', expId);
    if (!error) {
      // 3. Remove orphaned files from Storage bucket
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }

      if (expenseToDelete) {
        this.travelStore.insertActivityLog(
          this.tripId()!,
          'DELETED_EXPENSE',
          'EXPENSE',
          expId,
          expenseToDelete.desc || 'an expense',
          { amount: expenseToDelete.amount }
        );
      }
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



  // ─── Edit Member ──────────────────────────────────────────────────────────
  openEditMember(member: Member) {
    this.editingMember = member;
    this.editMemberName = member.name || '';
    this.editMemberEmail = member.email || '';
    this.editMemberOpen.set(true);
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
    const removedMember = dbMembers.find((m: any) => m.id === memberId);
    await db.from('trips').update({ members: updated }).eq('id', trip.id);
    this.travelStore.updateTrip(trip.id, { members: updated });

    if (removedMember) {
      this.travelStore.insertActivityLog(
        trip.id,
        'REMOVED_MEMBER',
        'MEMBER',
        memberId,
        removedMember.name
      );
    }
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
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
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
      
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
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

  getExpenseSummaryContext(expense: Expense): { type: 'lent' | 'owe' | 'neutral', message: string } | null {
    if (!expense || expense.category === 'SETTLEMENT') return null;

    const uid = this.currentUserId();
    const isPayer = expense.payerId === uid;
    
    let myShare = 0;
    if (expense.splits && Object.keys(expense.splits).filter(k => !k.startsWith('__')).length > 0) {
      if (expense.splits[uid] !== undefined) {
         myShare = expense.splits[uid];
      }
    } else {
       const tripObj = this.trip();
       if (tripObj && tripObj.members) {
         const membersCount = tripObj.members.length || 1;
         const isMember = tripObj.members.some(m => m.id === uid);
         if (isMember) {
            myShare = Math.round(expense.amount / membersCount);
         }
       }
    }

    if (isPayer) {
       if (myShare === 0) {
          return { type: 'lent', message: `${this.translationService.translate('expense.summary.lentAll')} ${this.formatNumber(expense.amount)}đ` };
       } else if (myShare > 0 && myShare < expense.amount) {
          return { type: 'lent', message: `${this.translationService.translate('expense.summary.lentPart1')} ${this.formatNumber(expense.amount)}đ ${this.translationService.translate('expense.summary.lentPart2')} ${this.formatNumber(expense.amount - myShare)}đ` };
       } else if (myShare >= expense.amount) {
          return { type: 'neutral', message: this.translationService.translate('expense.summary.lentFull') };
       }
    } else {
       if (myShare > 0) {
          const payerName = this.getPayerName(expense.payerId);
          return { type: 'owe', message: `${this.translationService.translate('expense.summary.owe')} ${payerName} ${this.formatNumber(myShare)}đ` };
       } else {
          return { type: 'neutral', message: this.translationService.translate('expense.summary.notInvolved') };
       }
    }
    return null;
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

  formatDateShort(dateStr: string): string {
    if (!dateStr || dateStr === 'Unknown Date') return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  formatRelative(ts: string): string {
    if (!ts) return '';
    try {
      const diff = Date.now() - new Date(ts).getTime();
      if (isNaN(diff)) return '';
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch {
      return '';
    }
  }

  formatCurrency(val: number): string { 
    if (val === null || val === undefined) return '0₫';
    return `${(val || 0).toLocaleString('en-US')}₫`; 
  }
  
  formatNumber(val: number): string   { 
    if (val === null || val === undefined) return '0';
    return (val || 0).toLocaleString('en-US'); 
  }

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
