import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { TravelStore } from '../core/store/travel.store';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
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
    if (url.includes('/trip')) return 1;
    if (url.includes('/add-moment')) return 2;
    if (url.includes('/profile')) return 3;
    if (url.includes('/notifications')) return 4;
    return -1; // Default to no highlight if no match
  });

  onTabClick(index: number) {
    if (this.activeIndex() === index) {
      const content = document.querySelector('.shell-content');
      if (content) {
        content.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }
}
