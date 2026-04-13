import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaBannerComponent } from './shared/components/pwa-banner/pwa-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PwaBannerComponent],
  template: `
    <app-pwa-banner />
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
