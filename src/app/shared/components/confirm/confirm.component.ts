import { Component, inject } from '@angular/core';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-confirm',
  standalone: true,
  template: `
    @if (confirmService.currentConfirm()) {
      <div 
        class="confirm-overlay" 
        [class.visible]="confirmService.isVisible()"
        (click)="confirmService.respond(false)"
      >
        <div class="confirm-modal" (click)="$event.stopPropagation()">
          <h3 class="confirm-title">{{ confirmService.currentConfirm()?.title }}</h3>
          <p class="confirm-message" [innerHTML]="confirmService.currentConfirm()?.message"></p>
          <div class="confirm-actions">
            <button class="btn-cancel" (click)="confirmService.respond(false)">
              {{ confirmService.currentConfirm()?.cancelText }}
            </button>
            <button class="btn-confirm" (click)="confirmService.respond(true)">
              {{ confirmService.currentConfirm()?.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100dvh;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    .confirm-overlay.visible {
      opacity: 1;
      visibility: visible;
    }
    
    .confirm-overlay.visible .confirm-modal {
      transform: scale(1) translateY(0);
      opacity: 1;
    }

    .confirm-modal {
      width: 90%;
      max-width: 320px;
      /* Super Premium Liquid Glass */
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.4));
      backdrop-filter: blur(32px);
      -webkit-backdrop-filter: blur(32px);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 32px;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.1), inset 0 2px 10px rgba(255, 255, 255, 0.7);
      transform: scale(0.95) translateY(10px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .confirm-title {
      font-size: 20px;
      font-weight: 800;
      color: #1C1917;
      margin: 0 0 12px 0;
      text-align: center;
      letter-spacing: -0.02em;
    }

    .confirm-message {
      font-size: 15px;
      color: #78716C;
      margin: 0 0 32px 0;
      text-align: center;
      line-height: 1.5;
    }

    .confirm-actions {
      display: flex;
      gap: 12px;
      width: 100%;
    }

    button {
      flex: 1;
      padding: 16px;
      border-radius: 100px;
      font-size: 15px;
      font-weight: 800;
      border: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .btn-cancel {
      background: rgba(255, 255, 255, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.8);
      color: #1C1917;
      box-shadow: 0 4px 12px rgba(0,0,0,0.02), inset 0 2px 4px rgba(255,255,255, 0.8);
    }

    .btn-cancel:hover {
      background: rgba(255, 255, 255, 0.8);
      transform: translateY(-2px);
    }

    .btn-confirm {
      background: rgba(28, 25, 23, 0.85); /* Universal Premium Dark */
      color: #FFFFFF !important;
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .btn-confirm:hover {
      background: rgba(28, 25, 23, 0.95);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }
  `]
})
export class ConfirmComponent {
  confirmService = inject(ConfirmService);
}
