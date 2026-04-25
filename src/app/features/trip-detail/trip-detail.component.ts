import { Component, inject, signal, computed, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, NgZone, ViewEncapsulation, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Expense, Member, ExpenseCategory } from '../../core/models/expense.model';
import { Post, Comment } from '../../core/models/social.model';

import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MomentsComponent } from '../moments/moments.component';




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
import { TripBalances } from './components/trip-balances/trip-balances';
import { TripExpensesComponent } from './components/trip-expenses/trip-expenses';
import { TripSocialComponent } from './components/trip-social/trip-social';
import { ExpenseModalComponent } from './components/modals/expense-modal/expense-modal';
import { SettleModalComponent } from './components/modals/settle-modal/settle-modal';
import { EditPostModalComponent } from './components/modals/edit-post-modal/edit-post-modal';
import { AddMemberModalComponent } from './components/modals/add-member-modal/add-member-modal';
import { EditMemberModalComponent } from './components/modals/edit-member-modal/edit-member-modal';
import { EditTripModalComponent } from './components/modals/edit-trip-modal/edit-trip-modal';
import { ExpenseDetailModalComponent } from './components/modals/expense-detail-modal/expense-detail-modal';
import { TripDetailService } from './services/trip-detail.service';
import { TripExportService } from './services/trip-export.service';
import { calculateDebts, calculateChartData, calculateYourShare } from '../../core/utils/settlement.util';
import { getAvatarBg, getAvatarColor } from '../../core/utils/avatar.util';
import { formatNumber, formatDate, formatRelative } from '../../core/utils/format.util';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [FormsModule, MomentsComponent, TranslatePipe, TripBalances, TripExpensesComponent, TripSocialComponent, ExpenseModalComponent, SettleModalComponent, EditPostModalComponent, AddMemberModalComponent, EditMemberModalComponent, EditTripModalComponent, ExpenseDetailModalComponent],
  templateUrl: './trip-detail.component.html',
  styleUrl: './trip-detail.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TripDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private travelStore = inject(TravelStore);

  private resizeObserver?: ResizeObserver;

  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private tripDetailService = inject(TripDetailService);
  private tripExportService = inject(TripExportService);

  constructor() {
    effect(() => {
      this.trip();
      this.tripExpenses();
      this.tripPosts();
      this.tripActivities();
      
      setTimeout(() => this.updateCarouselHeight(), 100);
    });
  }

  readonly defaultCover = 'https://images.unsplash.com/photo-1473496169904-6a58eb22bf2f?q=80&w=1000';

  readonly tabs = ['MOMENTS', 'SOCIAL', 'EXPENSES', 'BALANCES', 'MEMBERS', 'ACTIVITY'];
  activeTab = 'SOCIAL';


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



  // ─── Edit Post modal state ─────────────────────────────────────────────
  readonly editPostOpen = signal(false);
  editPostObj: Post | null = null;

  // ─── Add Member modal state ───────────────────────────────────────────
  readonly addMemberOpen = signal(false);

  // ─── Edit Member modal state ──────────────────────────────────────────
  readonly editMemberOpen = signal(false);
  editingMember: Member | null = null;

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


  readonly tripPosts = computed<Post[]>(() =>
    this.travelStore.posts().filter(p => p.tripId === this.tripId())
  );



  readonly totalTripCost = computed(() =>
    this.tripExpenses().reduce((sum, e) => sum + (e.category === 'SETTLEMENT' ? 0 : e.amount), 0)
  );

  readonly yourShare = computed(() => 
    calculateYourShare(this.tripExpenses(), this.currentUserId(), this.trip()?.members?.length || 1)
  );

  readonly chartData = computed(() => 
    calculateChartData(this.tripExpenses())
  );

  readonly debts = computed<Debt[]>(() => 
    calculateDebts(this.tripExpenses(), this.trip()?.members || [], this.currentUserId())
  );

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

    await this.tripDetailService.loadExpenses(this.tripId());
    await this.tripDetailService.loadPosts(this.tripId(), this.trip(), this.currentUserId());
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
    this.resizeObserver = new ResizeObserver(() => {
      this.updateCarouselHeight();
    });

    if (this.tabCarousel?.nativeElement) {
      const panes = this.tabCarousel.nativeElement.querySelectorAll('.tab-pane');
      panes.forEach(pane => this.resizeObserver?.observe(pane));
    }
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  updateCarouselHeight() {
    if (!this.tabCarousel?.nativeElement) return;
    const activeIndex = this.tabs.indexOf(this.activeTab);
    const panes = this.tabCarousel.nativeElement.querySelectorAll('.tab-pane');
    const activePane = panes[activeIndex] as HTMLElement;
    
    if (activePane) {
      this.tabCarousel.nativeElement.style.height = `${activePane.scrollHeight}px`;
    }
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
    
    setTimeout(() => this.updateCarouselHeight(), 50);
  }

  onTabScroll(event: Event) {
    const el = event.target as HTMLElement;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (this.tabs[index] && this.activeTab !== this.tabs[index]) {
      this.activeTab = this.tabs[index];
      this.updateCarouselHeight();
      
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
    await this.tripDetailService.toggleLike(postId, this.currentUserId(), this.tripPosts());
  }

  openComments(post: Post) {
    this.router.navigate(['/post', post.id]);
  }

  async deletePost(postId: string) {
    await this.tripDetailService.deletePost(postId, this.tripPosts());
  }

  // ─── Edit Post ────────────────────────────────────────────────────────────
  openEditPost(post: Post) {
    this.editPostObj = post;
    this.editPostOpen.set(true);
  }

  // ─── Share Post ───────────────────────────────────────────────────────────
  async sharePost(event: any) {
    if (event && event.post) {
      await this.tripDetailService.sharePost(event.post, event.index);
    } else {
      await this.tripDetailService.sharePost(event as Post);
    }
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  openExpenseModal() {
    this.editingExpense = null;
    this.expenseModalOpen.set(true);
  }

  openExpenseDetail(exp: Expense) { this.selectedExpense = exp; }

  // ─── Lightbox for viewing receipts ───────────────────────────────────────
  // (Moved to ExpenseDetailModalComponent)

  editExpense(exp: Expense) {
    this.editingExpense = exp;
    this.selectedExpense = null;
    this.expenseModalOpen.set(true);
  }

  async deleteExpenseConfirm(expId: string) {
    const success = await this.tripDetailService.deleteExpenseConfirm(expId, this.tripId(), this.tripExpenses());
    if (success) {
      this.selectedExpense = null;
    }
  }

  // ─── Members ──────────────────────────────────────────────────────────────
  openAddMemberModal() {
    this.addMemberOpen.set(true);
  }



  // ─── Edit Member ──────────────────────────────────────────────────────────
  openEditMember(member: Member) {
    this.editingMember = member;
    this.editMemberOpen.set(true);
  }



  async removeMember(memberId: string) {
    const trip = this.trip();
    if (!trip) return;
    await this.tripDetailService.removeMember(trip, memberId);
  }

  // ─── Delete Trip ───────────────────────────────────────────────────────────
  async confirmDelete() {
    await this.tripDetailService.confirmDeleteTrip(this.tripId());
  }

  async publishTrip() {
    const isCurrentlyPrivate = this.trip()?.isPrivate ?? true;
    await this.tripDetailService.publishTrip(this.tripId(), isCurrentlyPrivate);
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  exportExcel() {
    this.tripExportService.exportExcel(this.trip(), this.tripExpenses(), this.debts(), this.totalTripCost());
  }

  formatDate = formatDate;
  formatRelative = formatRelative;
  formatNumber = formatNumber;

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;
}
