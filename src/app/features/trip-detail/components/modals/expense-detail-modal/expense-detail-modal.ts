import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule, LowerCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../../core/i18n/translation.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Expense, Member } from '../../../../../core/models/expense.model';
import { CATEGORY_META } from '../../../trip-detail.component';
import { formatNumber, formatDate } from '../../../../../core/utils/format.util';

@Component({
  selector: 'app-expense-detail-modal',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SwipeToCloseDirective, LowerCasePipe],
  templateUrl: './expense-detail-modal.html',
  styleUrl: './expense-detail-modal.css'
})
export class ExpenseDetailModalComponent {
  @Input({ required: true }) expense!: Expense;
  @Input() members: Member[] = [];
  @Input() currentUserId = '';
  @Input() isMember = false;

  @Output() onClose = new EventEmitter<void>();
  @Output() onEdit = new EventEmitter<Expense>();
  @Output() onDelete = new EventEmitter<string>();

  private translationService = inject(TranslationService);

  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);

  close() {
    this.onClose.emit();
  }

  edit() {
    this.onEdit.emit(this.expense);
  }

  delete() {
    this.onDelete.emit(this.expense.id);
  }

  getPayerName(payerId: string): string {
    return this.members.find(m => m.id === payerId)?.name || 'Someone';
  }

  getFallbackSplit(exp: Expense): number {
    const membersCount = this.members.length || 1;
    return Math.round(exp.amount / membersCount);
  }

  getExpenseSummaryContext(expense: Expense): { type: 'lent' | 'owe' | 'neutral', message: string } | null {
    if (!expense || expense.category === 'SETTLEMENT') return null;

    const uid = this.currentUserId;
    const isPayer = expense.payerId === uid;
    
    let myShare = 0;
    if (expense.splits && Object.keys(expense.splits).filter(k => !k.startsWith('__')).length > 0) {
      if (expense.splits[uid] !== undefined) {
         myShare = expense.splits[uid];
      }
    } else {
       const membersCount = this.members.length || 1;
       const isIncluded = this.members.some(m => m.id === uid);
       if (isIncluded) {
          myShare = Math.round(expense.amount / membersCount);
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

  getCategoryEmoji(cat: string): string { return CATEGORY_META[cat]?.emoji || '💸'; }
  getCategoryLabel(cat: string): string { return CATEGORY_META[cat]?.label || 'Other'; }
  getCategoryBg(cat: string): string    { return CATEGORY_META[cat]?.bg    || '#F3F4F6'; }

  formatDate = formatDate;
  formatNumber = formatNumber;
}
