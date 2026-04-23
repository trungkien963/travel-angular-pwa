import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Trip, ActivityLog } from '../models/trip.model';
import { Expense } from '../models/expense.model';
import { Post } from '../models/social.model';
import { AppNotification } from '../models/notification.model';
import { SupabaseService } from '../services/supabase.service';
import { ToastService } from '../services/toast.service';

interface UserProfile {
  name: string;
  avatar?: string;
}

/**
 * TravelStore — Angular Signals equivalent of Zustand useTravelStore.
 * 
 * Zustand → Angular Signals mapping:
 *   create<State>()((set, get) => ...)  →  Injectable class with signal()
 *   set({ key: value })                 →  this.state.update(s => ({...s, key: value}))
 *   get().someKey                       →  this.someKey()   (computed signal)
 *   useStore(s => s.trips)              →  inject(TravelStore).trips
 */
@Injectable({ providedIn: 'root' })
export class TravelStore {
  private supabase = inject(SupabaseService);
  private toastService = inject(ToastService);

  // ─── State Signals (equivalent to Zustand state) ─────────────────────────
  readonly currentUserId = signal<string>('');
  readonly currentUserProfile = signal<UserProfile | undefined>(undefined);
  readonly trips = signal<Trip[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly posts = signal<Post[]>([]);
  readonly notifications = signal<AppNotification[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly isSyncing = signal(false);
  readonly isGlobalLoading = signal(false);

  // ─── Computed Selectors ───────────────────────────────────────────────────
  readonly unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);
  readonly myTrips = computed(() =>
    this.trips().filter(t => t.members?.some(m => m.id === this.currentUserId()))
  );
  readonly publicTrips = computed(() =>
    this.trips().filter(t => t.isPrivate === false)
  );

  constructor() {
    effect(() => {
      const count = this.unreadCount();
      if ('setAppBadge' in navigator) {
        if (count > 0) {
          (navigator as any).setAppBadge(count).catch(console.error);
        } else {
          (navigator as any).clearAppBadge().catch(console.error);
        }
      }
    });
  }

  // ─── Actions: App Loading ─────────────────────────────────────────────────
  setGlobalLoading(loading: boolean) {
    this.isGlobalLoading.set(loading);
  }

  // ─── Actions: Trips ───────────────────────────────────────────────────────
  setTrips(trips: Trip[]) { this.trips.set(trips); }

  addTrip(trip: Trip) {
    this.trips.update(list => [trip, ...list]);
  }

  updateTrip(id: string, data: Partial<Trip>) {
    this.trips.update(list => list.map(t => t.id === id ? { ...t, ...data } : t));
  }

  async deleteTrip(id: string) {
    const db = this.supabase.client;
    const trip = this.trips().find(t => t.id === id);
    const expenses = this.expenses().filter(e => e.tripId === id);
    const posts = this.posts().filter(p => p.tripId === id);

    const urlsToDelete: string[] = [];
    if (trip?.coverImage) urlsToDelete.push(trip.coverImage);
    expenses.forEach(e => { if (e.receipts) urlsToDelete.push(...e.receipts); });
    posts.forEach(p => { if (p.images) urlsToDelete.push(...p.images); });

    const pathsToDelete = urlsToDelete
      .filter(url => url && url.includes('/nomadsync-media/'))
      .map(url => url.split('/nomadsync-media/')[1]);

    // Clear URLs before delete to bypass storage triggers
    await db.from('expenses').update({ receipt_urls: null }).eq('trip_id', id);
    await db.from('posts').update({ image_urls: null }).eq('trip_id', id);
    await db.from('trips').update({ cover_image: null }).eq('id', id);

    const { error } = await db.from('trips').delete().eq('id', id);
    if (error) throw error;

    if (pathsToDelete.length > 0) {
      await db.storage.from('nomadsync-media').remove(pathsToDelete);
    }

    this.trips.update(list => list.filter(t => t.id !== id));
    this.expenses.update(list => list.filter(e => e.tripId !== id));
    this.posts.update(list => list.filter(p => p.tripId !== id));
  }

  removeTrip(id: string) {
    this.trips.update(list => list.filter(t => t.id !== id));
    this.expenses.update(list => list.filter(e => e.tripId !== id));
    this.posts.update(list => list.filter(p => p.tripId !== id));
  }

  // ─── Actions: Expenses ────────────────────────────────────────────────────
  addExpense(expense: Expense) {
    const parsed = this._parseExpenseDetails(expense);
    this.expenses.update(list => [parsed, ...list]);
  }

  updateExpense(id: string, data: Partial<Expense>) {
    this.expenses.update(list => list.map(e => e.id === id ? { ...e, ...data } : e));
  }

  deleteExpense(id: string) {
    this.expenses.update(list => list.filter(e => e.id !== id));
  }

  removeExpense(id: string) { this.deleteExpense(id); }

  upsertExpense(expense: Expense) {
    const parsed = this._parseExpenseDetails(expense);
    this.expenses.update(list => {
      const idx = list.findIndex(e => e.id === parsed.id);
      return idx >= 0 ? list.map(e => e.id === parsed.id ? parsed : e) : [parsed, ...list];
    });
  }

  private _parseExpenseDetails(expense: Expense): Expense {
    let splits = expense.splits;
    if (typeof splits === 'string') {
      try { splits = JSON.parse(splits); } catch (e) { splits = {}; }
    }
    if (!splits || typeof splits !== 'object') splits = {};

    let receipts = expense.receipts;
    if (typeof receipts === 'string') {
      try { receipts = JSON.parse(receipts); } catch (e) { receipts = []; }
    }
    if (!Array.isArray(receipts)) receipts = [];

    return { ...expense, splits, receipts };
  }

  // ─── Actions: Posts ───────────────────────────────────────────────────────
  addPost(post: Post) {
    this.posts.update(list => [post, ...list]);
  }

  updatePost(id: string, data: Partial<Post>) {
    this.posts.update(list => list.map(p => p.id === id ? { ...p, ...data } : p));
  }

  deletePost(id: string) {
    this.posts.update(list => list.filter(p => p.id !== id));
  }

  removePost(id: string) { this.deletePost(id); }

  // ─── Actions: Notifications ───────────────────────────────────────────────
  addNotification(notification: AppNotification) {
    this.notifications.update(list => [notification, ...list]);
  }

  async markNotificationAsRead(id: string) {
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    try {
      await this.supabase.client.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  }

  async markAllNotificationsAsRead() {
    this.notifications.update(list =>
      list.map(n => ({ ...n, isRead: true }))
    );
    try {
      const userId = this.currentUserId();
      if (userId) {
        await this.supabase.client.from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  }

  // ─── Actions: Activity Logs ───────────────────────────────────────────────
  async insertActivityLog(tripId: string, action: string, targetType: string, targetId?: string, targetName?: string, details?: any) {
    const userId = this.currentUserId();
    const profile = this.currentUserProfile();
    const memberName = profile?.name || 'Unknown';
    if (!userId || !tripId) return;

    try {
      const payload: any = {
        trip_id: tripId,
        user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId || null,
        target_name: targetName || null,
        details: details || null
      };

      const { data, error } = await this.supabase.client.from('activity_logs').insert(payload).select().single();
      if (!error && data) {
        const newLog: ActivityLog = {
          id: data.id,
          tripId: data.trip_id,
          userId: data.user_id,
          userName: memberName,
          userAvatar: profile?.avatar,
          action: data.action,
          targetType: data.target_type,
          targetId: data.target_id,
          targetName: data.target_name,
          details: data.details,
          createdAt: data.created_at
        };
        this.activityLogs.update(list => [newLog, ...list]);
      }
    } catch (err) {
      console.warn('Failed to insert activity log', err);
    }
  }

  // ─── Supabase Init & Sync ─────────────────────────────────────────────────
  async initSupabase() {
    this.isSyncing.set(true);
    try {
      const { data: authData } = await this.supabase.client.auth.getUser();
      if (authData?.user) {
        const meta = authData.user.user_metadata;
        this.currentUserId.set(authData.user.id);
        this.currentUserProfile.set({
          name: meta?.['full_name'] || meta?.['name'] || 'Traveler',
          avatar: meta?.['avatar_url'] || meta?.['picture'] || undefined
        });

        // L2: Request Web Push Permission on app launch if needed
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(console.warn);
        }

        // Upsert to public.users to satisfy foreign key constraint
        try {
          await this.supabase.client.from('users').upsert({
            id: authData.user.id,
            email: authData.user.email,
            full_name: meta?.['full_name'] || meta?.['name'] || authData.user.email?.split('@')[0],
            avatar_url: meta?.['avatar_url'] || meta?.['picture'] || null
          }, { onConflict: 'id' });
        } catch (err) {
          console.log('Failed to sync auth.user to public.users', err);
        }

        this.setupRealtimeSync();
      }

      await this.refreshData();
    } catch (err) {
      console.error('Supabase sync failed', err);
    } finally {
      this.isSyncing.set(false);
    }
  }

  async refreshData() {
    const db = this.supabase.client;
    try {
      // Fetch users mapping
      const { data: usersData } = await db.from('users').select('id, email, full_name, avatar_url');
      const userMap = new Map<string, any>();
      if (usersData) {
        usersData.forEach(u => userMap.set(u.id, u));
      }

      // Update current user profile if needed
      const uid = this.currentUserId();
      if (uid && userMap.has(uid)) {
        const dbUser = userMap.get(uid);
        const currentProfile = this.currentUserProfile();
        this.currentUserProfile.set({
          name: dbUser.full_name || currentProfile?.name || 'Traveler',
          avatar: dbUser.avatar_url || currentProfile?.avatar
        });
      }

      // Fetch trips
      const { data: tripsData, error: tripsError } = await db.from('trips').select('*').order('created_at', { ascending: false });
      if (!tripsError && tripsData) {
        const formattedTrips: Trip[] = tripsData.map(t => {
          let parsedMembers = typeof t['members'] === 'string'
            ? JSON.parse(t['members'])
            : (Array.isArray(t['members']) ? t['members'] : []);
          
          parsedMembers = parsedMembers.map((m: any) => {
            const u = userMap.get(m.id);
            if (u) {
              const isAutoGeneratedName = u.full_name === u.email?.split('@')[0];
              m.name = m.nickname || ( (!isAutoGeneratedName && u.full_name) ? u.full_name : (m.name || u.full_name || 'Traveler') );
              m.avatar = u.avatar_url || m.avatar;
            } else {
              m.name = m.nickname || m.name;
            }
            return m;
          });

          let parsedComments = typeof t['comments'] === 'string'
            ? JSON.parse(t['comments'])
            : (Array.isArray(t['comments']) ? t['comments'] : []);
          
          parsedComments = parsedComments.map((c: any) => {
            const u = userMap.get(c.authorId);
            if (u) {
              const isAutoGeneratedName = u.full_name === u.email?.split('@')[0];
              c.authorName = c.authorNickname || ( (!isAutoGeneratedName && u.full_name) ? u.full_name : (c.authorName || u.full_name || 'Traveler') );
              c.authorAvatar = u.avatar_url || c.authorAvatar;
            } else {
              c.authorName = c.authorNickname || c.authorName;
            }
            return c;
          });

          return {
            id: t['id'],
            title: t['title'],
            locationName: t['location_name'],
            locationCity: t['location_city'],
            coverImage: t['cover_image'],
            startDate: t['start_date'],
            endDate: t['end_date'],
            ownerId: t['owner_id'] || this.currentUserId(),
            isPrivate: t['is_private'],
            members: parsedMembers,
            likes: typeof t['likes'] === 'string'
              ? JSON.parse(t['likes'])
              : (Array.isArray(t['likes']) ? t['likes'] : []),
            comments: parsedComments
          };
        });

        // Fetch posts
        const { data: postsData, error: postsError } = await db.from('posts').select('*, trips(members)').order('created_at', { ascending: false });
        let formattedPosts: Post[] = [];
        if (!postsError && postsData) {
          formattedPosts = postsData.map((p: any) => {
            let parsedLikes = p['likes'];
            if (typeof parsedLikes === 'string') {
              try { parsedLikes = JSON.parse(parsedLikes); } catch (e) { parsedLikes = []; }
            }
            if (!Array.isArray(parsedLikes)) parsedLikes = [];




            let parsedImages = p['image_urls'];
            if (typeof parsedImages === 'string') {
              try { parsedImages = JSON.parse(parsedImages); } catch (e) { parsedImages = []; }
            }
            if (!Array.isArray(parsedImages)) parsedImages = [];

            // Extract author from trips.members
            let authorName = 'Traveler';
            let authorAvatar = undefined;
            if (p.trips && p.trips.members) {
              let members = p.trips.members;
              if (typeof members === 'string') {
                try { members = JSON.parse(members); } catch (e) { members = []; }
              }
              const author = Array.isArray(members) ? members.find((m: any) => m.id === p['user_id']) : undefined;
              if (author) {
                authorName = author.name || 'Traveler';
                authorAvatar = author.avatar;
              }
            } else {
              // Fallback to formattedTrips if trips(members) wasn't selected (though it should be)
              const fallbackAuthor = formattedTrips.find(t => t.id === p['trip_id'])?.members?.find(m => m.id === p['user_id']);
              if (fallbackAuthor) {
                authorName = fallbackAuthor.name || 'Traveler';
                authorAvatar = fallbackAuthor.avatar;
              }
            }

            return {
              id: p['id'],
              tripId: p['trip_id'],
              authorId: p['user_id'],
              authorName: authorName,
              authorAvatar: authorAvatar,
              content: p['content'] || '',
              images: parsedImages,
              isDual: p['is_dual_camera'] || false,
              timestamp: p['created_at'] || new Date().toISOString(),
              date: p['created_at'] ? p['created_at'].substring(0, 10) : new Date().toISOString().substring(0, 10),
              likes: parsedLikes.length,
              hasLiked: parsedLikes.includes(this.currentUserId()),
              commentCount: p['comment_count'] || 0
            };
          });
        }

        // Fetch expenses
        const { data: expensesData, error: expensesError } = await db.from('expenses').select('*');
        let formattedExpenses: Expense[] = [];
        if (!expensesError && expensesData) {
          formattedExpenses = expensesData.map(e => {
            let parsedSplits = e['splits'];
            if (typeof parsedSplits === 'string') {
               try { parsedSplits = JSON.parse(parsedSplits); } catch (e) { parsedSplits = {}; }
            }
            if (!parsedSplits || typeof parsedSplits !== 'object') parsedSplits = {};

            let parsedReceipts = e['receipt_urls'];
            if (typeof parsedReceipts === 'string') {
               try { parsedReceipts = JSON.parse(parsedReceipts); } catch (e) { parsedReceipts = []; }
            }
            if (!Array.isArray(parsedReceipts)) parsedReceipts = [];

            return {
              id: e['id'],
              tripId: e['trip_id'],
              amount: e['amount'],
              desc: e['description'] || '',
              date: parsedSplits['__date'] || (e['created_at'] ? e['created_at'].substring(0, 10) : new Date().toISOString().substring(0, 10)),
              createdAt: e['created_at'],
              payerId: e['payer_id'] || 'Traveler',
              category: e['category'] || 'OTHER',
              splits: parsedSplits,
              receipts: parsedReceipts,
              isEdited: !!parsedSplits['__isEdited']
            };
          });
        }

        // Fetch notifications
        const userId = this.currentUserId();
        if (userId) {
          const { data: notifsData } = await db.from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30);

          if (notifsData) {
            this.notifications.set(notifsData.map(n => ({
              id: n['id'],
              type: n['type'],
              actorName: n['actor_name'],
              actorAvatar: n['actor_avatar'],
              message: n['message'],
              tripId: n['trip_id'],
              postId: n['post_id'],
              expenseId: n['expense_id'],
              createdAt: n['created_at'],
              isRead: n['is_read']
            })));
          }
        }

        // Fetch activity logs
        const { data: activitiesData } = await db.from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (activitiesData) {
          this.activityLogs.set(activitiesData.map(a => {
            const u = userMap.get(a.user_id);
            return {
              id: a.id,
              tripId: a.trip_id,
              userId: a.user_id,
              userName: u?.full_name || 'Traveler',
              userAvatar: u?.avatar_url,
              action: a.action,
              targetType: a.target_type,
              targetId: a.target_id,
              targetName: a.target_name,
              details: a.details,
              createdAt: a.created_at
            };
          }));
        }

        this.trips.set(formattedTrips);
        this.posts.set(formattedPosts);
        this.expenses.set(formattedExpenses);
      }
    } catch (err) {
      console.error('Refresh failed', err);
    }
  }

  // ─── Realtime Subscriptions (Delta Update Architecture) ───────────────────
  setupRealtimeSync() {
    const db = this.supabase.client;
    const userId = this.currentUserId();
    if (!userId) return;

    // Cleanup existing channels
    db.getChannels().forEach(ch => {
      if (['realtime:public:notifications', 'realtime:public:sync'].includes(ch.topic)) {
        db.removeChannel(ch);
      }
    });

    // Notification channel
    db.channel('public:notifications')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const n = payload.new as any;
        this.notifications.update(list => [{
          id: n.id, type: n.type, actorName: n.actor_name,
          actorAvatar: n.actor_avatar, message: n.message,
          tripId: n.trip_id, postId: n.post_id, expenseId: n.expense_id,
          createdAt: n.created_at, isRead: n.is_read
        }, ...list]);

        // Auto-fetch fresh data from REST API to guarantee consistency, 
        // bypassing any WebSocket RLS dropout or REPLICA IDENTITY issues on the posts table.
        this.refreshData();

        // L2: Trigger Web Push notification if allowed
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('WanderPool ✨', {
              body: n.message,
              icon: n.actor_avatar || '/assets/icons/icon-192x192.png'
            });
          } catch (e) {
            console.warn('Web Push failed:', e);
          }
        }

        // Show in-app Toast Notification for invitations or other events
        if (n.type === 'invite' || (n.message && n.message.toLowerCase().includes('invite'))) {
          this.toastService.show(`💌 ${n.message}`, 'success');
        } else {
          this.toastService.show(`🔔 ${n.message}`, 'info');
        }
      })

      .subscribe();

    // Data sync channel (posts + expenses delta, trips full refresh, plus broadcast for RLS invisible->visible transitions)
    db.channel('public:sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        this.refreshData(); // Safe: trips have complex relations
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
        this._handleExpenseDelta(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        this._handlePostDelta(payload);
      })
      .on('broadcast', { event: 'force_refresh' }, () => {
        // Triggered manually when an item's visibility changes (e.g. Publish Trip)
        // to circumvent Supabase Realtime dropping RLS transition events
        this.refreshData();
      })
      .subscribe();
  }

  broadcastRefresh() {
    this.supabase.client.channel('public:sync').send({
      type: 'broadcast',
      event: 'force_refresh',
      payload: { timestamp: Date.now() }
    }).catch(console.warn);
  }


  private _handlePostDelta(payload: any) {
    if (payload.eventType === 'DELETE') {
      this.posts.update(list => list.filter(p => p.id !== payload.old.id));
      return;
    }
    const p = payload.new;
    const trip = this.trips().find(t => t.id === p.trip_id);
    const author = trip?.members?.find(m => m.id === p.user_id);

    let parsedLikes = p.likes;
    if (typeof parsedLikes === 'string') {
      try { parsedLikes = JSON.parse(parsedLikes); } catch (e) { parsedLikes = []; }
    }
    if (!Array.isArray(parsedLikes)) parsedLikes = [];



    let parsedImages = p.image_urls;
    if (typeof parsedImages === 'string') {
      try { parsedImages = JSON.parse(parsedImages); } catch (e) { parsedImages = []; }
    }
    if (!Array.isArray(parsedImages)) parsedImages = [];

    const formatted: Post = {
      id: p.id, tripId: p.trip_id, authorId: p.user_id,
      authorName: author?.name || 'Traveler',
      authorAvatar: author?.avatar,
      content: p.content || '', images: parsedImages,
      isDual: p.is_dual_camera || false,
      timestamp: p.created_at || new Date().toISOString(),
      date: p.created_at ? p.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
      likes: parsedLikes.length,
      hasLiked: parsedLikes.includes(this.currentUserId()),
      commentCount: p.comment_count || 0
    };

    if (payload.eventType === 'INSERT') {
      this.posts.update(list => list.some(e => e.id === formatted.id) ? list : [formatted, ...list]);
    } else if (payload.eventType === 'UPDATE') {
      this.posts.update(list => list.map(existing =>
        existing.id !== p.id ? existing : { ...existing, ...formatted }
      ));
    }
  }

  private _handleExpenseDelta(payload: any) {
    if (payload.eventType === 'DELETE') {
      this.expenses.update(list => list.filter(e => e.id !== payload.old.id));
      return;
    }
    const e = payload.new;
    let parsedSplits = e.splits;
    if (typeof parsedSplits === 'string') {
      try { parsedSplits = JSON.parse(parsedSplits); } catch (err) { parsedSplits = {}; }
    }
    if (!parsedSplits || typeof parsedSplits !== 'object') parsedSplits = {};

    let parsedReceipts = e.receipt_urls;
    if (typeof parsedReceipts === 'string') {
      try { parsedReceipts = JSON.parse(parsedReceipts); } catch (err) { parsedReceipts = []; }
    }
    if (!Array.isArray(parsedReceipts)) parsedReceipts = [];

    const formatted: Expense = {
      id: e.id, tripId: e.trip_id, amount: e.amount,
      desc: e.description || '',
      date: parsedSplits['__date'] || (e.created_at ? e.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10)),
      createdAt: e.created_at,
      payerId: e.payer_id || 'Traveler',
      category: e.category || 'OTHER',
      splits: parsedSplits, receipts: parsedReceipts,
      isEdited: !!parsedSplits['__isEdited']
    };

    if (payload.eventType === 'INSERT') {
      this.expenses.update(list => list.some(ex => ex.id === formatted.id) ? list : [formatted, ...list]);
    } else if (payload.eventType === 'UPDATE') {
      this.expenses.update(list => list.map(ex => ex.id === formatted.id ? formatted : ex));
    }
  }
}
