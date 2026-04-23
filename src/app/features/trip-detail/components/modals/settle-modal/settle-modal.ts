import { Component, Input, Output, EventEmitter, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { CalculatorInputComponent } from '../../../../../shared/components/calculator-input/calculator-input.component';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Expense } from '../../../../../core/models/expense.model';
import { Trip } from '../../../../../core/models/trip.model';
import { calculateSettleRelatedExpenses } from '../../../../../core/utils/settlement.util';
import { Debt, CATEGORY_META } from '../../../trip-detail.component';

@Component({
  selector: 'app-settle-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, CalculatorInputComponent, SwipeToCloseDirective],
  templateUrl: './settle-modal.html',
  styleUrl: './settle-modal.css'
})
export class SettleModalComponent implements OnInit {
  @Input({ required: true }) debt!: Debt;
  @Input({ required: true }) trip!: Trip;
  @Input({ required: true }) tripExpenses!: Expense[];
  @Input({ required: true }) currentUserId!: string;
  @Output() onClose = new EventEmitter<void>();

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);

  settleAmount = 0;
  settleNote = '';
  readonly settleReceipts = signal<{url: string, file?: File}[]>([]);
  readonly isSavingSettle = signal(false);

  ngOnInit() {
    this.settleAmount = this.debt.amount;
  }

  readonly settleRelatedExpenses = computed(() => {
    return calculateSettleRelatedExpenses(
      this.debt,
      this.tripExpenses,
      this.trip.members,
      (cat: string) => this.getCategoryLabel(cat)
    );
  });

  getCategoryLabel(cat: string): string {
    return CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label || cat;
  }

  getCategoryBg(cat: string): string {
    return CATEGORY_META[cat as keyof typeof CATEGORY_META]?.bg || '#F3F4F6';
  }

  getCategoryEmoji(cat: string): string {
    return CATEGORY_META[cat as keyof typeof CATEGORY_META]?.emoji || '🏷️';
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

  formatDateShort(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch(e) { return dateStr; }
  }

  formatNumber(val: number): string {
    return val.toLocaleString('vi-VN');
  }

  onSettleAmountChange(val: any) {
    this.settleAmount = val || 0;
  }

  onSettleReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const newFiles = Array.from(input.files).map(file => ({
        url: URL.createObjectURL(file),
        file
      }));
      this.settleReceipts.update(prev => [...prev, ...newFiles]);
    }
    input.value = '';
  }

  removeSettleReceipt(index: number, event: Event) {
    event.stopPropagation();
    const arr = this.settleReceipts();
    if (arr[index].url.startsWith('blob:')) URL.revokeObjectURL(arr[index].url);
    const newArr = [...arr];
    newArr.splice(index, 1);
    this.settleReceipts.set(newArr);
  }

  handleClose() {
    this.onClose.emit();
  }

  async submitSettle() {
    if (!this.debt || this.settleAmount <= 0) return;
    
    this.isSavingSettle.set(true);
    this.travelStore.setGlobalLoading(true);
    try {
      const expDate = new Date().toISOString().split('T')[0];
      const db = this.supabaseService.client;
      // We model settlement as: Payer = Debtor. Split = { Creditor: amount }
      const splits: Record<string, any> = {
        [this.debt.toId]: this.settleAmount,
        '__date': expDate,
        '__isSettlement': true
      };
      
      if (this.settleNote.trim()) {
        splits['__note'] = this.settleNote.trim();
      }

      let finalReceiptUrls: string[] = [];
      const currentReceipts = this.settleReceipts();
      for (const rec of currentReceipts) {
         if (rec.file) {
            const uid = this.currentUserId;
            const rPath = `receipts/${uid}/${Date.now()}_${rec.file.name.replace(/[^a-zA-Z0-9.\\-]/g,'_')}`;
            const { data: rData, error: uploadErr } = await db.storage.from('nomadsync-media').upload(rPath, rec.file, { upsert: true });
            if (rData) {
               const { data: rUrlData } = db.storage.from('nomadsync-media').getPublicUrl(rPath);
               finalReceiptUrls.push(rUrlData.publicUrl);
            }
         } else {
            finalReceiptUrls.push(rec.url);
         }
      }

      const payload: any = {
         trip_id: this.trip.id,
         description: this.debt.fromName + ' ➔ ' + this.debt.toName,
         amount: this.settleAmount,
         category: 'OTHER',
         payer_id: this.debt.fromId,
         splits,
         created_at: new Date().toISOString()
      };
      
      if (finalReceiptUrls.length > 0) {
        payload.receipt_urls = finalReceiptUrls;
      }
      
      const { data, error } = await db.from('expenses').insert(payload).select().single();
      if (error) throw error;
      
      if (data) {
        this.travelStore.addExpense({
           id: data['id'], tripId: data['trip_id'], desc: data['description'],
           amount: data['amount'], category: (splits['__isSettlement'] ? 'SETTLEMENT' : data['category']) as unknown as any,
           payerId: data['payer_id'], date: expDate, 
           createdAt: data['created_at'], splits: data['splits'], receipts: data['receipt_urls']
        });
      }
      
      this.toastService.show('Đã ghi nhận thanh toán!', 'success');
      this.onClose.emit();
    } catch(err) {
      console.error(err);
      this.toastService.show('Lỗi ghi nhận thanh toán', 'error');
    } finally {
      this.isSavingSettle.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
