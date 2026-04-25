import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Post, Comment } from '../../../core/models/social.model';
import { TravelStore } from '../../../core/store/travel.store';

@Injectable({
  providedIn: 'root'
})
export class PostDetailService {
  private supabase = inject(SupabaseService);
  private store = inject(TravelStore);

  // Lấy chi tiết bài viết (Dùng cache trong store nếu có, hoặc fetch mới)
  async getPostById(postId: string): Promise<Post | null> {
    // 1. Tìm trong store trước để lấy nhanh
    const cachedPost = this.store.posts().find(p => p.id === postId);
    if (cachedPost) {
      return cachedPost;
    }

    // 2. Nếu không có (ví dụ reload trang), gọi API lấy từ Supabase
    try {
      const { data, error } = await this.supabase.client
        .from('posts')
        .select(`
          *,
          trips (
            members
          ),
          users:user_id (
            full_name,
            avatar_url,
            email
          )
        `)
        .eq('id', postId)
        .single();

      if (error || !data) throw new Error('Không tìm thấy dữ liệu bài viết.');

      // Map data tương tự như trong store
      let authorName = 'Traveler';
      let authorAvatar = undefined;
      
      if (data.trips && data.trips.members) {
        let members = data.trips.members;
        if (typeof members === 'string') {
          try { members = JSON.parse(members); } catch (e) { members = []; }
        }
        const author = Array.isArray(members) ? members.find((m: any) => m.id === data.user_id) : undefined;
        
        const u = Array.isArray(data.users) ? (data.users[0] || {}) : (data.users || {});
        
        if (author) {
          authorName = author.nickname || u.full_name || author.name || 'Traveler';
          authorAvatar = u.avatar_url || author.avatar;
        } else {
          authorName = u.full_name || u.email?.split('@')[0] || 'Traveler';
          authorAvatar = u.avatar_url;
        }
      }

        const parsedLikes = Array.isArray(data.likes) ? data.likes : (typeof data.likes === 'string' ? JSON.parse(data.likes) : []);
        
      return {
        id: data.id,
        tripId: data.trip_id,
        authorId: data.user_id,
        authorName: authorName,
        authorAvatar: authorAvatar,
        content: data.content,
        images: Array.isArray(data.image_urls) ? data.image_urls : (typeof data.image_urls === 'string' ? JSON.parse(data.image_urls) : []),
        isDual: data.is_dual_camera || false,
        timestamp: data.created_at,
        date: data.created_at?.substring(0, 10),
        likes: parsedLikes.length,
        hasLiked: parsedLikes.includes(this.store.currentUserId()),
        commentCount: data.comment_count || 0
      };
    } catch (err: any) {
      console.error('Error fetching post', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể tải chi tiết bài viết.');
    }
  }

  // Lấy danh sách người đã like bài viết
  async getLikesList(postId: string): Promise<{id: string, name: string, avatar?: string}[]> {
    try {
      const { data: postData, error: postError } = await this.supabase.client
        .from('posts')
        .select('likes, trip_id')
        .eq('id', postId)
        .single();
        
      if (postError) throw postError;
      
      let likeIds: string[] = [];
      if (postData && postData.likes) {
         likeIds = Array.isArray(postData.likes) ? postData.likes : (typeof postData.likes === 'string' ? JSON.parse(postData.likes) : []);
      }
      
      if (likeIds.length === 0) return [];

      const { data: usersData, error: usersError } = await this.supabase.client
        .from('users')
        .select('id, full_name, avatar_url, email')
        .in('id', likeIds);
        
      if (usersError) throw usersError;
      
      const tripId = postData?.trip_id;
      const trip = this.store.trips().find(t => t.id === tripId);
      const members = trip?.members || [];

      return (usersData || []).map((u: any) => {
        const member = members.find(m => m.id === u.id);
        const nameToUse = member?.name || u.full_name || u.email?.split('@')[0] || 'Traveler';
        return {
          id: u.id,
          name: nameToUse,
          avatar: member?.avatar || u.avatar_url
        };
      });
    } catch (err: any) {
      console.error('Error fetching likes list', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể tải danh sách người thích.');
    }
  }

  // Lấy bình luận cho bài viết
  async getComments(postId: string): Promise<Comment[]> {
    try {
      // Join với public.users để lấy tên và avatar người comment
      const { data, error } = await this.supabase.client
        .from('comments')
        .select(`
          id,
          post_id,
          user_id,
          content,
          created_at,
          users (
            full_name,
            avatar_url,
            email
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data) return [];

      const post = this.store.posts().find(p => p.id === postId);
      const trip = this.store.trips().find(t => t.id === post?.tripId);
      const members = trip?.members || [];

      return data.map((c: any) => {
        const u = Array.isArray(c.users) ? (c.users[0] || {}) : (c.users || {});
        const member = members.find(m => m.id === c.user_id);
        const nameToUse = member?.name || u.full_name || u.email?.split('@')[0] || 'Traveler';

        return {
          id: c.id,
          authorId: c.user_id,
          authorName: nameToUse,
          authorAvatar: member?.avatar || u.avatar_url,
          text: c.content,
          timestamp: c.created_at
        } as Comment;
      });
    } catch (err: any) {
      console.error('Error fetching comments', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể tải danh sách bình luận.');
    }
  }

  async addComment(postId: string, text: string): Promise<Comment | null> {
    const userId = this.store.currentUserId();
    if (!userId) return null;

    try {
      const { data, error } = await this.supabase.client
        .from('comments')
        .insert({
          post_id: postId,
          user_id: userId,
          content: text
        })
        .select(`
          id, post_id, user_id, content, created_at,
          users (full_name, avatar_url, email)
        `)
        .single();

      if (error || !data) throw new Error('Cơ sở dữ liệu từ chối lưu bình luận.');
      
      // Update comment_count in DB
      const { data: currentPostDb } = await this.supabase.client.from('posts').select('comment_count').eq('id', postId).single();
      if (currentPostDb) {
        await this.supabase.client.from('posts').update({ comment_count: (currentPostDb.comment_count || 0) + 1 }).eq('id', postId);
      }

      const u = Array.isArray(data.users) ? (data.users[0] || {}) : (data.users || {});
      
      const post = this.store.posts().find(p => p.id === postId);
      const trip = this.store.trips().find(t => t.id === post?.tripId);
      const member = trip?.members?.find(m => m.id === data.user_id);
      const nameToUse = member?.name || u.full_name || u.email?.split('@')[0] || 'Traveler';

      // --- SEND NOTIFICATIONS ---
      const uniqueMentions: any[] = [];
      if (trip?.members) {
        for (const m of trip.members) {
          if (m.id === userId) continue;
          const escapedName = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`@${escapedName}(?![\\w\\p{L}])`, 'gu');
          if (regex.test(text)) {
            uniqueMentions.push(m);
          }
        }
      }
      
      // 1. Notify mentioned users
      for (const mentionedUser of uniqueMentions) {
        this.supabase.client.rpc('handle_batched_notification', {
          p_type: 'POST_COMMENT',
          p_user_id: mentionedUser.id,
          p_actor_name: nameToUse,
          p_actor_avatar: member?.avatar || u.avatar_url || null,
          p_message: 'mentioned you in a comment',
          p_trip_id: trip?.id || null
        }).then();
      }

      // 2. Notify post author (if not the commenter and not already notified via mention)
      const mentionedIds = uniqueMentions.map(m => m.id);
      if (post && post.authorId && post.authorId !== userId && !mentionedIds.includes(post.authorId)) {
        this.supabase.client.rpc('handle_batched_notification', {
          p_type: 'POST_COMMENT',
          p_user_id: post.authorId,
          p_actor_name: nameToUse,
          p_actor_avatar: member?.avatar || u.avatar_url || null,
          p_message: 'commented on your post',
          p_trip_id: trip?.id || null
        }).then();
      }
      // --------------------------

      return {
        id: data.id,
        authorId: data.user_id,
        authorName: nameToUse,
        authorAvatar: member?.avatar || u.avatar_url,
        text: data.content,
        timestamp: data.created_at
      };
    } catch (err: any) {
      console.error('Error adding comment', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể gửi bình luận vào lúc này.');
    }
  }

  async deleteComment(commentId: string) {
    const uid = this.store.currentUserId();
    if (!uid) throw new Error('Not authenticated');

    try {
      // First get post_id
      const { data: commentData } = await this.supabase.client.from('comments').select('post_id').eq('id', commentId).single();
      const postId = commentData?.post_id;

      const { error } = await this.supabase.client
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', uid); // Ensure only author can delete

      if (error) throw error;

      // Update comment_count in DB
      if (postId) {
        const { data: currentPostDb } = await this.supabase.client.from('posts').select('comment_count').eq('id', postId).single();
        if (currentPostDb) {
          await this.supabase.client.from('posts').update({ comment_count: Math.max(0, (currentPostDb.comment_count || 0) - 1) }).eq('id', postId);
        }
      }
    } catch (err: any) {
      console.error('Error deleting comment', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể xóa bình luận vào lúc này.');
    }
  }

  async toggleLike(postId: string, newLiked: boolean) {
    const uid = this.store.currentUserId();
    if (!uid) return;
    
    try {
      const { data, error } = await this.supabase.client.from('posts').select('likes').eq('id', postId).single();
      if (error) throw error;

      let currentLikes: string[] = [];
      if (data && data.likes) {
        const raw = data.likes;
        if (Array.isArray(raw)) currentLikes = raw;
        else if (typeof raw === 'string') {
          try { currentLikes = JSON.parse(raw); } catch(e){}
        }
      }
      
      let updatedLikes: string[];
      if (newLiked) {
        updatedLikes = !currentLikes.includes(uid) ? [...currentLikes, uid] : currentLikes;
      } else {
        updatedLikes = currentLikes.filter(id => id !== uid);
      }

      const { error: updateError } = await this.supabase.client.from('posts').update({ likes: updatedLikes }).eq('id', postId);
      if (updateError) throw updateError;
      
      // Update store
      const post = this.store.posts().find(p => p.id === postId);
      if (post) {
         this.store.updatePost(postId, { hasLiked: updatedLikes.includes(uid), likes: updatedLikes.length });
      }
    } catch (err: any) {
       console.error('Lỗi khi toggle like', err);
       throw err;
    }
  }
}
