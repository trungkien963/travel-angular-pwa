import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslationService } from '../../../../../core/i18n/translation.service';
import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { ConfirmService } from '../../../../../core/services/confirm.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Post } from '../../../../../core/models/social.model';

@Component({
  selector: 'app-edit-post-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeToCloseDirective],
  templateUrl: './edit-post-modal.html',
  styleUrl: './edit-post-modal.css'
})
export class EditPostModalComponent implements OnInit {
  @Input({ required: true }) post!: Post;
  @Output() onClose = new EventEmitter<void>();

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private translationService = inject(TranslationService);

  editPostContent = '';
  readonly isSavingPost = signal(false);

  ngOnInit() {
    this.editPostContent = this.post.content || '';
  }

  async closeLocal() {
    if (this.editPostContent.trim() !== (this.post.content || '')) {
      const confirmed = await this.confirmService.confirm(
        this.translationService.translate('modal.unsavedChanges'), 
        this.translationService.translate('modal.warning'), 
        this.translationService.translate('action.close'), 
        this.translationService.translate('action.continue')
      );
      if (confirmed) {
        this.onClose.emit();
      }
    } else {
      this.onClose.emit();
    }
  }

  async saveEditPost() {
    if (!this.post) return;
    const db = this.supabaseService.client;
    this.isSavingPost.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const { error } = await db
        .from('posts')
        .update({ content: this.editPostContent })
        .eq('id', this.post.id);

      if (error) throw error;

      this.travelStore.updatePost(this.post.id, { content: this.editPostContent });
      this.onClose.emit();
    } catch (err: any) {
      this.toastService.show(err.message || this.translationService.translate('error.editPost'), 'error');
    } finally {
      this.isSavingPost.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
