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

import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent implements OnInit {
  private router = inject(Router);
  private travelStore = inject(TravelStore);

  readonly notifications = computed(() => this.travelStore.notifications());
  readonly groupedNotifications = computed(() => {
    const raw = this.notifications();
    const grouped: (AppNotification & { groupedCount?: number; originalIds?: string[] })[] = [];
    const TIME_WINDOW = 12 * 60 * 60 * 1000; // 12 hours

    for (const notif of raw) {
      if (grouped.length === 0) {
        grouped.push({ ...notif, originalIds: [notif.id] });
        continue;
      }

      const notifTime = new Date(notif.createdAt).getTime();
      
      const matchIndex = grouped.findIndex(g => {
        if (g.type !== notif.type || g.actorName !== notif.actorName) return false;
        if (Math.abs(new Date(g.createdAt).getTime() - notifTime) > TIME_WINDOW) return false;
        
        if (['POST_LIKE', 'POST_NEW', 'TRIP_LIKE'].includes(notif.type)) {
          return true; // Group regardless of target ID
        }
        
        return g.postId === notif.postId && g.tripId === notif.tripId;
      });

      if (matchIndex !== -1) {
        const match = grouped[matchIndex];
        match.groupedCount = (match.groupedCount || 1) + 1;
        match.originalIds?.push(notif.id);
        if (!notif.isRead) match.isRead = false;
      } else {
        grouped.push({ ...notif, originalIds: [notif.id] });
      }
    }

    return grouped.map(g => {
      if (g.groupedCount && g.groupedCount > 1) {
        let newMsg = g.message;
        if (g.type === 'POST_LIKE' || g.type === 'TRIP_LIKE') {
          newMsg = ` đã thích ${g.groupedCount} khoảnh khắc của bạn.`;
        } else if (g.type === 'POST_NEW') {
          newMsg = ` vừa thêm ${g.groupedCount} khoảnh khắc mới.`;
        } else if (g.type === 'POST_COMMENT' || g.type === 'TRIP_COMMENT') {
          newMsg = ` đã để lại ${g.groupedCount} bình luận mới.`;
        }
        return { ...g, message: newMsg };
      }
      return g;
    });
  });

  readonly hasUnread = computed(() => this.groupedNotifications().some(n => !n.isRead));

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
  async handlePress(item: AppNotification & { originalIds?: string[] }) {
    if (!item.isRead) {
      if (item.originalIds) {
        item.originalIds.forEach(id => this.travelStore.markNotificationAsRead(id));
      } else {
        this.travelStore.markNotificationAsRead(item.id);
      }
    }
    // Force a fresh HTTP pull to guarantee the newly added post/expense is visible
    // immediately regardless of WebSocket delta status.
    await this.travelStore.refreshData();
    
    switch (item.type) {
      case 'POST_NEW':
      case 'POST_LIKE':
        if (item.postId) {
          this.router.navigate(['/post', item.postId]);
        } else if (item.tripId) {
          this.router.navigate(['/trip', item.tripId]);
        }
        break;
      case 'POST_COMMENT':
        if (item.postId) {
          this.router.navigate(['/post', item.postId], { queryParams: { scrollTo: 'comments' } });
        } else if (item.tripId) {
          this.router.navigate(['/trip', item.tripId]);
        }
        break;
      case 'EXPENSE_ADDED':
        if (item.tripId) {
          this.router.navigate(['/trip', item.tripId], { queryParams: { tab: 'EXPENSES' } });
        }
        break;
      case 'TRIP_LIKE':
      case 'TRIP_COMMENT':
        if (item.tripId) {
          this.router.navigate(['/trip', item.tripId], { queryParams: { tab: 'MOMENTS' } });
        }
        break;
      case 'TRIP_INVITE':
      default:
        if (item.tripId) {
          this.router.navigate(['/trip', item.tripId]);
        }
        break;
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
