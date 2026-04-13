import { Injectable, signal, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private swUpdate = inject(SwUpdate);

  // ─── Install Prompt ───────────────────────────────────────────────────────
  readonly canInstall = signal(false);
  readonly updateAvailable = signal(false);
  readonly showIosPrompt = signal(false);
  private deferredPrompt: any = null;

  constructor() {
    this.listenForInstallPrompt();
    this.listenForSwUpdates();
    this.checkIosSafari();
  }

  private checkIosSafari() {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
    // Check if already in standalone mode
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;

    // Only show prompt if on iOS Safari, not installed, and not dismissed before
    if (isIos && isSafari && !isStandalone) {
      const dismissed = localStorage.getItem('pwa_ios_dismissed');
      if (!dismissed) {
        this.showIosPrompt.set(true);
      }
    }
  }

  // Capture the browser's beforeinstallprompt event
  private listenForInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    // When installed via prompt, clear the state
    window.addEventListener('appinstalled', () => {
      this.canInstall.set(false);
      this.deferredPrompt = null;
    });
  }

  async promptInstall(): Promise<void> {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    const result = await this.deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      this.canInstall.set(false);
    }
    this.deferredPrompt = null;
  }

  // ─── SW Update ────────────────────────────────────────────────────────────
  private listenForSwUpdates() {
    if (!this.swUpdate.isEnabled) return;

    // Check for updates on each navigation
    this.swUpdate.checkForUpdate().catch(() => {});

    // Listen for version-ready event
    this.swUpdate.versionUpdates.pipe(
      filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
    ).subscribe(() => {
      this.updateAvailable.set(true);
    });
  }

  async applyUpdate(): Promise<void> {
    await this.swUpdate.activateUpdate();
    window.location.reload();
  }

  dismiss() {
    this.updateAvailable.set(false);
  }

  dismissIos() {
    localStorage.setItem('pwa_ios_dismissed', 'true');
    this.showIosPrompt.set(false);
  }
}
