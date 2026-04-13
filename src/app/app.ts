import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaBannerComponent } from './shared/components/pwa-banner/pwa-banner.component';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PwaBannerComponent, LoadingSpinnerComponent],
  template: `
    <app-pwa-banner />
    <app-loading-spinner />
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
export class App {}

