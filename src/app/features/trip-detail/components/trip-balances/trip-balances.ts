import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Debt } from '../../trip-detail.component';

@Component({
  selector: 'app-trip-balances',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './trip-balances.html',
  styleUrl: './trip-balances.css',
})
export class TripBalances {
  @Input({ required: true }) totalTripCost: number = 0;
  @Input({ required: true }) chartData: any[] = [];
  @Input({ required: true }) debts: Debt[] = [];
  @Input({ required: true }) totalOwedToYou: number = 0;
  @Input({ required: true }) totalYouOwe: number = 0;
  @Input({ required: true }) isMember: boolean = false;
  @Input({ required: true }) isOwner: boolean = false;
  @Input({ required: true }) currentUserId: string = '';

  @Output() onOpenSettleModal = new EventEmitter<Debt>();
  @Output() onExportExcel = new EventEmitter<void>();

  readonly activeBalanceFilter = signal<'ALL' | 'MINE'>('ALL');

  readonly displayDebts = computed(() => {
    const allDebts = this.debts || [];
    const filter = this.activeBalanceFilter();
    const uid = this.currentUserId;

    if (filter === 'MINE') {
      return allDebts.filter(d => d.fromId === uid || d.toId === uid);
    }
    return allDebts;
  });

  // UI Helpers
  formatNumber(val: number): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(val));
  }

  getAvatarBg(name: string): string {
    const colors = ['#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#F3E8FF', '#FCE7F3'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getAvatarColor(name: string): string {
    const colors = ['#DC2626', '#D97706', '#059669', '#2563EB', '#7C3AED', '#DB2777'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }
}
