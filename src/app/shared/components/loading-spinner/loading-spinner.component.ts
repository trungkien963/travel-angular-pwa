import { Component, inject } from '@angular/core';
import { TravelStore } from '../../../core/store/travel.store';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [],
  template: `
    @if (store.isGlobalLoading()) {
      <div class="global-overlay" aria-live="polite" aria-label="Loading…">
        <div class="spinner-card">
          <div class="spinner-ring"></div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Instagram-style fullscreen frosted overlay */
    .global-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(255, 255, 255, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* White card container */
    .spinner-card {
      background: #FFFFFF;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.10);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Yellow spinning ring — matches RN ActivityIndicator color #FFC800 */
    .spinner-ring {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3.5px solid #F0F0F0;
      border-top-color: #FFC800;
      animation: spin 0.75s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoadingSpinnerComponent {
  readonly store = inject(TravelStore);
}
