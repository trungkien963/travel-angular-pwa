import { Component, Input, Output, EventEmitter, signal, computed, OnChanges, SimpleChanges } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Debt } from '../../trip-detail.component';
import { getAvatarBg, getAvatarColor } from '../../../../core/utils/avatar.util';
import { formatNumber } from '../../../../core/utils/format.util';

@Component({
  selector: 'app-trip-balances',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './trip-balances.html',
  styleUrl: './trip-balances.scss',
})
export class TripBalances implements OnChanges {
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
  private _refresh = signal(0);

  ngOnChanges(changes: SimpleChanges) {
    this._refresh.update(v => v + 1);
  }

  readonly displayDebts = computed(() => {
    this._refresh();
    const allDebts = this.debts || [];
    const filter = this.activeBalanceFilter();
    const uid = this.currentUserId;

    if (filter === 'MINE') {
      return allDebts.filter(d => d.fromId === uid || d.toId === uid);
    }
    return allDebts;
  });

  // UI Helpers
  formatNumber = formatNumber;

  getAvatarBg = getAvatarBg;
  getAvatarColor = getAvatarColor;
}
