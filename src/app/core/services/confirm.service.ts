import { Injectable, signal } from '@angular/core';

export interface ConfirmConfig {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly currentConfirm = signal<ConfirmConfig | null>(null);
  readonly isVisible = signal(false);

  confirm(
    message: string,
    title: string = 'Xác nhận',
    confirmText: string = 'OK',
    cancelText: string = 'Hủy'
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Set the config
      this.currentConfirm.set({
        message,
        title,
        confirmText,
        cancelText,
        resolve
      });
      // Delay visibility to allow animation
      setTimeout(() => {
        this.isVisible.set(true);
      }, 10);
    });
  }

  respond(result: boolean) {
    this.isVisible.set(false);
    
    const config = this.currentConfirm();
    if (config) {
      config.resolve(result);
      
      // Clear config after fade out animation
      setTimeout(() => {
        this.currentConfirm.set(null);
      }, 300);
    }
  }
}
