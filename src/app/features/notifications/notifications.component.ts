import { Component, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { AppNotification } from '../../core/models/notification.model';

const ICON_BACKGROUNDS: Record<string, string> = {
  TRIP_INVITE:    '#EFF6FF',
  EXPENSE_ADDED:  '#ECFDF5',
  POST_COMMENT:   '#FFFBEB',
  POST_LIKE:      '#FEF2F2',
  POST_NEW:       '#F5F3FF',
};

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  private router = inject(Router);
  private travelStore = inject(TravelStore);

  readonly notifications = computed(() => this.travelStore.notifications());

  // ─── Navigation ───────────────────────────────────────────────────────────
  goBack() {
    if (history.length > 1) {
      history.back();
    } else {
      this.router.navigate(['/discover']);
    }
  }

  // ─── Notification handlers ────────────────────────────────────────────────
  async handlePress(item: AppNotification) {
    if (!item.isRead) {
      this.travelStore.markNotificationAsRead(item.id);
    }
    // Force a fresh HTTP pull to guarantee the newly added post/expense is visible
    // immediately regardless of WebSocket delta status.
    await this.travelStore.refreshData();
    if (item.tripId) {
      this.router.navigate(['/trip', item.tripId]);
    }
  }

  handleAccept(item: AppNotification) {
    this.travelStore.markNotificationAsRead(item.id);
    if (item.tripId) {
      this.router.navigate(['/trip', item.tripId]);
    }
  }

  handleDecline(item: AppNotification) {
    this.travelStore.markNotificationAsRead(item.id);
    // Could call API to remove from trip members - low priority
  }

  handleSettle(item: AppNotification) {
    this.travelStore.markNotificationAsRead(item.id);
    if (item.tripId) {
      this.router.navigate(['/trip', item.tripId], { queryParams: { tab: 'BALANCES' } });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getIconBg(type: string): string {
    return ICON_BACKGROUNDS[type] || '#F3F4F6';
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();

    if (diff < 60_000)         return 'just now';
    if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000)    return `${Math.floor(diff / 86_400_000)}d ago`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
