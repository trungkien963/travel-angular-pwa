import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TravelStore } from '../core/store/travel.store';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private travelStore = inject(TravelStore);

  // Expose unread notification count to template
  readonly unreadCount = computed(() => this.travelStore.unreadCount());
}
