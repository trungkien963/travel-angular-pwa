import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastConfig {
  message: string;
  type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly currentToast = signal<ToastConfig | null>(null);
  readonly isVisible = signal(false);
  private timeoutId: any;

  show(message: string, type: ToastType = 'info') {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    // Convert generic alert messages to better categories based on context
    const msgLower = message.toLowerCase();
    if (msgLower.includes('failed') || msgLower.includes('please check') || msgLower.includes('must be') || msgLower.includes('chưa có')) {
      type = 'error';
    } else if (msgLower.includes('success') || msgLower.includes('live on') || msgLower.includes('copied')) {
      type = 'success';
    }

    this.currentToast.set({ message, type });
    this.isVisible.set(true);

    this.timeoutId = setTimeout(() => {
      this.close();
    }, 4000);
  }

  close() {
    this.isVisible.set(false);
    setTimeout(() => {
      this.currentToast.set(null);
    }, 300); // Wait for fade out
  }
}
