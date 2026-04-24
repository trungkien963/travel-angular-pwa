import { Component, Input, Output, EventEmitter, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PostDetailService } from '../../services/post-detail.service';
import { getAvatarBg, getAvatarColor } from '../../../../core/utils/avatar.util';

@Component({
  selector: 'app-likes-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './likes-modal.component.html',
  styleUrl: './likes-modal.component.scss'
})
export class LikesModalComponent implements OnInit {
  @Input({ required: true }) postId!: string;
  @Output() closeModal = new EventEmitter<void>();

  private postDetailService = inject(PostDetailService);

  readonly isLoadingLikes = signal(true);
  readonly likesList = signal<{id: string, name: string, avatar?: string}[]>([]);
  readonly errorMsg = signal<string | null>(null);

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;

  async ngOnInit() {
    this.isLoadingLikes.set(true);
    try {
      const list = await this.postDetailService.getLikesList(this.postId);
      this.likesList.set(list);
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Lỗi khi tải danh sách lượt thích');
    } finally {
      this.isLoadingLikes.set(false);
    }
  }
}
