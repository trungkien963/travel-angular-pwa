import { Component, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';

@Component({
  selector: 'app-pwa-banner',
  standalone: true,
  imports: [],
  templateUrl: './pwa-banner.component.html',
  styleUrl: './pwa-banner.component.scss'
})
export class PwaBannerComponent {
  readonly pwa = inject(PwaService);

  async install() {
    await this.pwa.promptInstall();
  }

  dismiss() {
    // Simply hide by setting canInstall to false for this session
    this.pwa.canInstall.set(false);
  }

  async update() {
    await this.pwa.applyUpdate();
  }
}
