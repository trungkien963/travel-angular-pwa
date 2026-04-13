import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';
import { Expense, Member } from '../../core/models/expense.model';
import { Post, Comment } from '../../core/models/social.model';
import { SupabaseService } from '../../core/services/supabase.service';
import { MomentsComponent } from '../moments/moments.component';

export interface Debt {
  fromId: string; fromName: string;
  toId: string; toName: string;
  amount: number;
}

const CATEGORY_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  FOOD:       { emoji: '🍜', label: 'Food',        color: '#F59E0B', bg: '#FEF3C7' },
  TRANSPORT:  { emoji: '🚗', label: 'Transport',   color: '#3B82F6', bg: '#DBEAFE' },
  HOTEL:      { emoji: '🏨', label: 'Hotel',       color: '#8B5CF6', bg: '#EDE9FE' },
  ACTIVITY:   { emoji: '🏄', label: 'Activity',    color: '#10B981', bg: '#D1FAE5' },
  SHOPPING:   { emoji: '🛍️', label: 'Shopping',   color: '#EC4899', bg: '#FCE7F3' },
  DRINKS:     { emoji: '🍹', label: 'Drinks',      color: '#06B6D4', bg: '#CFFAFE' },
  OTHER:      { emoji: '💸', label: 'Other',       color: '#6B7280', bg: '#F3F4F6' },
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

  readonly defaultCover = 'https://images.unsplash.com/photo-1473496169904-6a58eb22bf2f?q=80&w=1000';

  readonly tabs = ['MOMENTS', 'SOCIAL', 'EXPENSES', 'BALANCES', 'MEMBERS'];
  activeTab = 'SOCIAL';
  quickPostMode = false;
  editTripModal = false;
  selectedExpense: Expense | null = null;

  readonly expenseModalOpen = signal(false);
  readonly isSavingExpense = signal(false);
  editingExpense: Expense | null = null;

  // ─── Comments modal state ──────────────────────────────────────────────
  commentPost: Post | null = null;
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

    // Load expenses for this trip
    await this.loadExpenses();

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

  // ─── Navigation ───────────────────────────────────────────────────────────
  goBack() { this.router.navigate(['/trips']); }
  setTab(tab: string) { this.activeTab = tab; }
  navigateToAddMoment() {
    this.router.navigate(['/add-moment'], { queryParams: { tripId: this.tripId() } });
  }

  // ─── Social ───────────────────────────────────────────────────────────────
  async toggleLike(postId: string) {
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

      const currentLikes: string[] = Array.isArray(data['likes']) ? data['likes'] : [];
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
    this.commentPost = { ...post }; // snapshot to keep reference stable
    this.commentText = '';
  }

  closeComments() {
    this.commentPost = null;
    this.commentText = '';
  }

  async sendComment() {
    const text = this.commentText.trim();
    if (!text || !this.commentPost) return;
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

      const existingComments = this.commentPost!.comments || [];
      const updatedComments = [...existingComments, newComment];

      // Optimistic local state update
      this.travelStore.updatePost(this.commentPost!.id, { comments: updatedComments });
      this.commentPost = { ...this.commentPost!, comments: updatedComments };
      this.commentText = '';

      // Update Supabase using RPC to avoid race conditions on JSONB arrays
      const db = this.supabaseService.client;
      const { error } = await db.rpc('add_post_comment', {
        p_post_id: this.commentPost!.id,
        p_comment: newComment
      });
      
      if (error) {
        // Fallback to traditional update if RPC is not available in the database yet
        console.warn('RPC failed, falling back to full array replace:', error);
        await db.from('posts').update({ comments: updatedComments }).eq('id', this.commentPost!.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send comment.');
    } finally {
      this.isSendingComment.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deletePost(postId: string) {
    if (!confirm('Delete this post?')) return;
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
      alert(err.message || 'Failed to delete post.');
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
      alert(err.message || 'Failed to edit post.');
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
        alert('Link copied to clipboard!');
      } catch (err) {
        alert('Failed to copy link. Please manually copy the URL.');
      }
    }
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  openExpenseModal() {
    this.editingExpense = null;
    this.expForm = { desc: '', amount: 0, category: 'OTHER', payerId: this.currentUserId(), date: new Date().toISOString().split('T')[0] };
    this.expenseModalOpen.set(true);
  }

  openExpenseDetail(exp: Expense) { this.selectedExpense = exp; }

  editExpense(exp: Expense) {
    this.editingExpense = exp;
    this.expForm = { desc: exp.desc, amount: exp.amount, category: exp.category || 'OTHER', payerId: exp.payerId, date: exp.date };
    this.selectedExpense = null;
    this.expenseModalOpen.set(true);
  }

  async saveExpense() {
    if (!this.expForm.desc || !this.expForm.amount) return;
    this.isSavingExpense.set(true);
    this.travelStore.setGlobalLoading(true);

    const db = this.supabaseService.client;
    const members = this.trip()?.members || [];
    const share = Math.round(this.expForm.amount / members.length);
    const splits: Record<string, number> = {};
    members.forEach(m => splits[m.id] = share);

    const payload = {
      trip_id: this.tripId(),
      desc: this.expForm.desc,
      amount: this.expForm.amount,
      category: this.expForm.category,
      payer_id: this.expForm.payerId,
      date: this.expForm.date,
      splits
    };

    try {
      if (this.editingExpense) {
        const { data } = await db.from('expenses').update(payload).eq('id', this.editingExpense.id).select().single();
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['desc'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['date'], splits: data['splits']
        } as Expense);
      } else {
        const { data } = await db.from('expenses').insert(payload).select().single();
        if (data) this.travelStore.upsertExpense({
          id: data['id'], tripId: data['trip_id'], desc: data['desc'],
          amount: data['amount'], category: data['category'],
          payerId: data['payer_id'], date: data['date'], splits: data['splits']
        } as Expense);
      }
      this.expenseModalOpen.set(false);
      this.editingExpense = null;
    } catch (err: any) {
      alert(err.message || 'Failed to save expense');
    } finally {
      this.isSavingExpense.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deleteExpenseConfirm(expId: string) {
    if (!confirm('Delete this expense?')) return;
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
      const finalId = userId || ('guest_' + Date.now());
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

      const updatedMembers = [...trip.members, newMember];

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
      const updatedMember: Member = { ...this.editingMember, name, email };
      const newMembers = trip.members.map(m => m.id === updatedMember.id ? updatedMember : m);

      const db = this.supabaseService.client;
      const { error } = await db.from('trips').update({ members: newMembers }).eq('id', trip.id);
      if (error) throw error;

      this.travelStore.updateTrip(trip.id, { members: newMembers });
      this.editMemberOpen.set(false);
      this.editingMember = null;
    } catch (err: any) {
      alert(err.message || 'Failed to update member.');
    } finally {
      this.isSavingMember.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  async removeMember(memberId: string) {
    if (!confirm('Remove this member?')) return;
    const trip = this.trip();
    if (!trip) return;
    const db = this.supabaseService.client;
    const updated = trip.members.filter(m => m.id !== memberId);
    await db.from('trips').update({ members: updated }).eq('id', trip.id);
    this.travelStore.updateTrip(trip.id, { members: updated });
  }

  // ─── Delete Trip ───────────────────────────────────────────────────────────
  async confirmDelete() {
    if (!confirm('Delete this adventure permanently? This cannot be undone.')) return;
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
      alert(err.message || 'Failed to delete trip. Please try again.');
    }
  }

  publishTrip() {
    alert('Your amazing adventure is now live on the Discover feed! 🌍');
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  exportCSV() {
    let csv = 'Date,Description,Category,Payer,Amount(VND)\n';
    this.tripExpenses().forEach(e => {
      csv += `"${e.date}","${e.desc}","${e.category || 'OTHER'}","${this.getPayerName(e.payerId)}",${e.amount}\n`;
    });
    csv += '\nDebts\nFrom,To,Amount(VND)\n';
    this.debts().forEach(d => {
      csv += `"${d.fromName}","${d.toName}",${d.amount}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${this.trip()?.title || 'TripReport'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getPayerName(payerId: string): string {
    return this.trip()?.members.find(m => m.id === payerId)?.name || 'Someone';
  }

  getCategoryEmoji(cat: string): string { return CATEGORY_META[cat]?.emoji || '💸'; }
  getCategoryLabel(cat: string): string { return CATEGORY_META[cat]?.label || 'Other'; }
  getCategoryBg(cat: string): string    { return CATEGORY_META[cat]?.bg    || '#F3F4F6'; }

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
}
