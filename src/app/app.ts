import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaBannerComponent } from './shared/components/pwa-banner/pwa-banner.component';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ConfirmComponent } from './shared/components/confirm/confirm.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PwaBannerComponent, LoadingSpinnerComponent, ToastComponent, ConfirmComponent],
  template: `
    <app-pwa-banner />
    <app-loading-spinner />
    <app-toast />
    <app-confirm />
    <router-outlet />
  `,
  styles: [`
    :host {
      display: block;
      height: 100dvh;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      box-sizing: border-box;
    }
  `]
})
export class App implements OnInit {
  ngOnInit() {
    // Attempt to lock screen orientation to portrait
    if (screen.orientation && 'lock' in screen.orientation) {
      try {
        (screen.orientation as any).lock('portrait').catch((err: any) => {
          console.log('Screen orientation lock failed or not supported:', err);
        });
      } catch (e) {
        console.log('Screen orientation lock error:', e);
      }
    }
  }
}

