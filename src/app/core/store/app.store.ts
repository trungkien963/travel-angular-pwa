import { Injectable, signal, computed } from '@angular/core';

export interface AppState {
  theme: 'light' | 'dark';
  isOffline: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AppStore {
  // Equivalent to Zustand State
  private state = signal<AppState>({
    theme: 'light',
    isOffline: !navigator.onLine
  });

  // Equivalent to Zustand Selectors
  readonly theme = computed(() => this.state().theme);
  readonly isOffline = computed(() => this.state().isOffline);

  constructor() {
    window.addEventListener('online', () => this.setOffline(false));
    window.addEventListener('offline', () => this.setOffline(true));
  }

  // Equivalent to Zustand Actions
  setTheme(theme: 'light' | 'dark') {
    this.state.update(s => ({ ...s, theme }));
  }

  setOffline(status: boolean) {
    this.state.update(s => ({ ...s, isOffline: status }));
  }
}
