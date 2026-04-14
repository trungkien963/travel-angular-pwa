import { Component, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { AppNotification } from '../../core/models/notification.model';

const ICON_BACKGROUNDS: Record<string, string> = {
  TRIP_INVITE:    '#EFF6FF',
  EXPENSE_ADDED:  '#ECFDF5',
  POST_COMMENT:   '#FFFBEB',
  POST_LIKE:      '#FEF2F2',
  POST_NEW:       '#F5F3FF',
  TRIP_LIKE:      '#FEF2F2',
  TRIP_COMMENT:   '#FFFBEB',
};

@Component({
  selector: 'app-notifications',
  standalone: true,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent implements OnInit {
  private router = inject(Router);
  private travelStore = inject(TravelStore);

  readonly notifications = computed(() => this.travelStore.notifications());
  readonly hasUnread = computed(() => this.notifications().some(n => !n.isRead));

  async ngOnInit() {
    // If not already synced or syncing, initialize Supabase to fetch notifications
    if (!this.travelStore.isSyncing() && this.travelStore.currentUserId() === '') {
      await this.travelStore.initSupabase();
    } else {
      // Force refresh just in case we are missing recent notifications
      await this.travelStore.refreshData();
    }
  }

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

  markAllAsRead() {
    this.travelStore.markAllNotificationsAsRead();
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

  // Intercept hardcoded backend messages like "- $3000000" and convert to "- ₫3,000,000"
  formatMessage(msg: string): string {
    if (!msg) return '';
    return msg.replace(/\$(\d+)/g, (match, p1) => {
      const num = parseInt(p1, 10);
      return '₫' + num.toLocaleString('en-US');
    });
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
