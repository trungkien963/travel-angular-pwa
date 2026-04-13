import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { TravelStore } from '../core/store/travel.store';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslatePipe } from '../core/i18n/translate.pipe';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private travelStore = inject(TravelStore);
  private router = inject(Router);

  // Expose unread notification count to template
  readonly unreadCount = computed(() => this.travelStore.unreadCount());

  // Track active tab index for the moving indicator
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => (event as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  readonly activeIndex = computed(() => {
    const url = this.currentUrl() || '';
    if (url.includes('/discover')) return 0;
    if (url.includes('/trips')) return 1;
    if (url.includes('/add-moment')) return 2;
    if (url.includes('/profile')) return 3;
    // Notifications should be index 4 if we use 5 tabs, let's keep all 5 properly ordered.
    if (url.includes('/notifications')) return 4;
    return 0; // Default
  });
}
