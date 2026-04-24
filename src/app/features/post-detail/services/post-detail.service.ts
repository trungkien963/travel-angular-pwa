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
        if (author) {
          authorName = author.name || 'Traveler';
          authorAvatar = author.avatar;
        }
      }

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
        likes: Array.isArray(data.likes) ? data.likes.length : (typeof data.likes === 'string' ? JSON.parse(data.likes).length : 0),
        hasLiked: (data.likes || []).includes(this.store.currentUserId()),
        commentCount: data.comment_count || 0
      };
    } catch (err: any) {
      console.error('Error fetching post', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể tải chi tiết bài viết.');
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

      return data.map((c: any) => {
        const u = Array.isArray(c.users) ? (c.users[0] || {}) : (c.users || {});
        return {
          id: c.id,
          authorId: c.user_id,
          authorName: u.full_name || u.email?.split('@')[0] || 'Traveler',
          authorAvatar: u.avatar_url,
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
      
      const u = Array.isArray(data.users) ? (data.users[0] || {}) : (data.users || {});
      return {
        id: data.id,
        authorId: data.user_id,
        authorName: u.full_name || u.email?.split('@')[0] || 'Traveler',
        authorAvatar: u.avatar_url,
        text: data.content,
        timestamp: data.created_at
      };
    } catch (err: any) {
      console.error('Error adding comment', err);
      throw new Error(err?.message || 'Lỗi mạng: Không thể gửi bình luận vào lúc này.');
    }
  }
}
