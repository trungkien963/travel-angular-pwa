import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { TravelStore } from '../../../core/store/travel.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Router } from '@angular/router';
import { Expense } from '../../../core/models/expense.model';
import { Post } from '../../../core/models/social.model';
import { Trip } from '../../../core/models/trip.model';

@Injectable({
  providedIn: 'root'
})
export class TripDetailService {
  private supabaseService = inject(SupabaseService);
  private travelStore = inject(TravelStore);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private router = inject(Router);

  async loadExpenses(tripId: string) {
    const db = this.supabaseService.client;
    const { data } = await db.from('expenses').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
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

  async loadPosts(tripId: string, trip: Trip | null, currentUserId: string) {
    const db = this.supabaseService.client;
    const { data } = await db.from('posts').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
    if (data) {
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
          hasLiked: parsedLikes.includes(currentUserId),
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

  async deleteExpenseConfirm(expId: string, tripId: string, tripExpenses: Expense[]) {
    const confirmed = await this.confirmService.confirm('Delete this expense?');
    if (!confirmed) return false;
    const db = this.supabaseService.client;
    const expenseToDelete = tripExpenses.find(e => e.id === expId);
    
    const pathsToDelete = (expenseToDelete?.receipts || [])
      .filter(url => url && url.includes('/nomadsync-media/'))
      .map(url => url.split('/nomadsync-media/')[1]);

    if (pathsToDelete.length > 0) {
      await db.from('expenses').update({ receipt_urls: null }).eq('id', expId);
    }

    const { error } = await db.from('expenses').delete().eq('id', expId);
    if (!error) {
      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }
      if (expenseToDelete) {
        this.travelStore.insertActivityLog(
          tripId,
          'DELETED_EXPENSE',
          'EXPENSE',
          expId,
          expenseToDelete.desc || 'an expense',
          { amount: expenseToDelete.amount }
        );
      }
      this.travelStore.removeExpense(expId);
      return true;
    }
    return false;
  }

  async toggleLike(postId: string, currentUserId: string, tripPosts: Post[]) {
    const db = this.supabaseService.client;
    const post = tripPosts.find(p => p.id === postId);
    if (!post) return;

    const newLiked = !post.hasLiked;
    const newLikes = newLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
    this.travelStore.updatePost(postId, { hasLiked: newLiked, likes: newLikes });

    this.travelStore.setGlobalLoading(true);
    try {
      const { data, error } = await db.from('posts').select('likes').eq('id', postId).single();
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
      
      const userIndex = currentLikes.indexOf(currentUserId);
      let updatedLikes: string[];

      if (newLiked) {
        updatedLikes = userIndex === -1 ? [...currentLikes, currentUserId] : currentLikes;
      } else {
        updatedLikes = currentLikes.filter(id => id !== currentUserId);
      }

      const { error: updateError } = await db.from('posts').update({ likes: updatedLikes }).eq('id', postId);
      if (updateError) throw updateError;

      this.travelStore.updatePost(postId, {
        hasLiked: updatedLikes.includes(currentUserId),
        likes: updatedLikes.length
      });
    } catch (err: any) {
      this.travelStore.updatePost(postId, { hasLiked: post.hasLiked, likes: post.likes });
      console.error('toggleLike failed:', err);
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

  async deletePost(postId: string, tripPosts: Post[]) {
    const confirmed = await this.confirmService.confirm('Delete this post?');
    if (!confirmed) return;
    const db = this.supabaseService.client;
    const post = tripPosts.find(p => p.id === postId);
    this.travelStore.setGlobalLoading(true);
    try {
      const pathsToDelete = (post?.images || [])
        .filter(url => url && url.includes('/nomadsync-media/'))
        .map(url => url.split('/nomadsync-media/')[1]);

      if (pathsToDelete.length > 0) {
        await db.from('posts').update({ image_urls: null }).eq('id', postId);
      }

      const { error } = await db.from('posts').delete().eq('id', postId);
      if (error) throw error;

      if (pathsToDelete.length > 0) {
        await db.storage.from('nomadsync-media').remove(pathsToDelete);
      }

      this.travelStore.removePost(postId);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete post.', 'error');
    } finally {
      this.travelStore.setGlobalLoading(false);
    }
  }

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
      try {
        await navigator.clipboard.writeText(window.location.href);
        this.toastService.show('Link copied to clipboard!', 'success');
      } catch (err) {
        this.toastService.show('Failed to copy link. Please manually copy the URL.', 'error');
      }
    }
  }

  async removeMember(trip: Trip, memberId: string) {
    const confirmed = await this.confirmService.confirm('Remove this member?');
    if (!confirmed) return;
    const db = this.supabaseService.client;

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
      this.travelStore.insertActivityLog(trip.id, 'REMOVED_MEMBER', 'MEMBER', memberId, removedMember.name);
    }
  }

  async confirmDeleteTrip(tripId: string) {
    const confirmed = await this.confirmService.confirm('Delete this adventure permanently? This cannot be undone.');
    if (!confirmed) return;
    try {
      await this.travelStore.deleteTrip(tripId);
      this.router.navigate(['/trips']);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to delete trip. Please try again.', 'error');
    }
  }

  async publishTrip(tripId: string, isCurrentlyPrivate: boolean) {
    const actionText = isCurrentlyPrivate ? 'publish' : 'unpublish';
    const confirmMessage = isCurrentlyPrivate 
      ? 'Are you sure you want to publish this trip to the Discover feed?'
      : 'Are you sure you want to hide this trip from the Discover feed?';

    const confirmed = await this.confirmService.confirm(confirmMessage);
    if (!confirmed) return;
    
    this.travelStore.setGlobalLoading(true);
    
    try {
      const db = this.supabaseService.client;
      const { error } = await db.from('trips').update({ is_private: !isCurrentlyPrivate }).eq('id', tripId);

      if (error) throw error;
      
      this.travelStore.updateTrip(tripId, { isPrivate: !isCurrentlyPrivate });
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
}
