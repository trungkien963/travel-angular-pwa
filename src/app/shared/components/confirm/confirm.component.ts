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
          <p class="confirm-message">{{ confirmService.currentConfirm()?.message }}</p>
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
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
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
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 24px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      transform: scale(0.95) translateY(10px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .confirm-title {
      font-size: 18px;
      font-weight: 700;
      color: #1C1917;
      margin: 0 0 12px 0;
      text-align: center;
      letter-spacing: -0.02em;
    }

    .confirm-message {
      font-size: 15px;
      color: #4B5563;
      margin: 0 0 24px 0;
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
      padding: 14px;
      border-radius: 16px;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-cancel {
      background: rgba(0, 0, 0, 0.05);
      color: #4B5563;
    }

    .btn-cancel:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .btn-confirm {
      background: #EF4444; /* Changed to red to match standard danger / delete action themes */
      color: white;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
    }

    .btn-confirm:hover {
      background: #DC2626;
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
    }
  `]
})
export class ConfirmComponent {
  confirmService = inject(ConfirmService);
}
