import { Injectable, signal } from '@angular/core';

export interface PhotoCapture {
  id: string;
  url: string;
  file: File;
  isDual: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  readonly isCameraActive = signal(true);
  readonly facingMode = signal<'environment' | 'user'>('user');
  readonly isDualMode = signal(false);
  readonly isFlashOn = signal(false);
  readonly activeFilter = signal<'none' | 'film' | 'kodak' | 'y2k' | 'cine'>('none');
  
  videoDevices: MediaDeviceInfo[] = [];
  currentCameraId: string | null = null;
  private stream: MediaStream | null = null;
  private dualFirstImage: HTMLImageElement | null = null;

  async startCamera(videoElement: HTMLVideoElement) {
    this.stopCamera();
    this.isCameraActive.set(true);
    
    const constraints: any = {
      width: { ideal: 1080 },
      height: { ideal: 1440 }
    };

    if (this.currentCameraId && this.facingMode() === 'environment') {
      constraints.deviceId = { exact: this.currentCameraId };
    } else {
      constraints.facingMode = { ideal: this.facingMode() };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false
      });
      await this.onStreamActive(videoElement);
    } catch (err: any) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        console.warn('Camera constraint failed, falling back to any device');
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          await this.onStreamActive(videoElement);
        } catch (e2) {
          console.error('Fallback camera failed', e2);
        }
      } else {
        console.warn('Camera access denied or unavailable', err);
      }
    }
  }

  private async onStreamActive(videoElement: HTMLVideoElement) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.videoDevices = devices.filter(d => d.kind === 'videoinput');

    this.applyFlash();

    if (videoElement) {
      videoElement.srcObject = this.stream;
      videoElement.play().catch((e: any) => console.warn('Play interrupted', e));
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  toggleCamera(videoElement: HTMLVideoElement) {
    this.facingMode.update(m => m === 'environment' ? 'user' : 'environment');
    this.currentCameraId = null; // Reset explicit lens when flipping
    this.startCamera(videoElement);
  }

  hasMultipleBackCameras(): boolean {
    return this.videoDevices.filter(d => !d.label.toLowerCase().includes('front')).length > 1;
  }

  cycleLens(videoElement: HTMLVideoElement) {
    const backs = this.videoDevices.filter(d => !d.label.toLowerCase().includes('front'));
    if (backs.length < 2) return;
    let idx = backs.findIndex(d => d.deviceId === this.currentCameraId);
    idx = (idx + 1) % backs.length;
    this.currentCameraId = backs[idx].deviceId;
    this.facingMode.set('environment');
    this.startCamera(videoElement);
  }

  toggleFlash() {
    this.isFlashOn.update(v => !v);
    this.applyFlash();
  }

  applyFlash() {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        track.applyConstraints({
          advanced: [{ torch: this.isFlashOn() } as any]
        }).catch(err => console.warn('Torch constraint rejected:', err));
      } catch (e) {
        console.warn('Torch not supported');
      }
    }
  }

  toggleDualMode() {
    this.isDualMode.update(v => !v);
  }

  async capturePhoto(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): Promise<PhotoCapture | null> {
    return new Promise((resolve) => {
      if (!videoElement || !canvasElement) return resolve(null);
      
      const displayWidth = videoElement.offsetWidth;
      const displayHeight = videoElement.offsetHeight;
      
      const videoRatio = videoElement.videoWidth / videoElement.videoHeight;
      const displayRatio = displayWidth / displayHeight;

      let targetWidth, targetHeight;
      let sx = 0, sy = 0, sw = videoElement.videoWidth, sh = videoElement.videoHeight;

      if (videoRatio > displayRatio) {
        targetHeight = videoElement.videoHeight;
        targetWidth = videoElement.videoHeight * displayRatio;
        sw = targetWidth;
        sx = (videoElement.videoWidth - sw) / 2;
      } else {
        targetWidth = videoElement.videoWidth;
        targetHeight = videoElement.videoWidth / displayRatio;
        sh = targetHeight;
        sy = (videoElement.videoHeight - sh) / 2;
      }

      canvasElement.width = targetWidth || 1080;
      canvasElement.height = targetHeight || 1080;
      const ctx = (canvasElement as any).getContext('2d', { colorSpace: 'display-p3' }) || canvasElement.getContext('2d');
      if (!ctx) return resolve(null);

      // Apply Base CSS Filters
      if (this.activeFilter() === 'film') {
          ctx.filter = 'sepia(0.05) saturate(1.05) hue-rotate(-2deg)';
      } else if (this.activeFilter() === 'kodak') {
          ctx.filter = 'sepia(0.1) saturate(1.1)';
      } else if (this.activeFilter() === 'y2k') {
          ctx.filter = 'contrast(0.95) brightness(1.1) saturate(1.1) sepia(0.05) hue-rotate(-5deg)';
      } else if (this.activeFilter() === 'cine') {
          ctx.filter = 'contrast(1.05) saturate(0.85) brightness(0.95) sepia(0.05) hue-rotate(5deg)';
      }

      // Draw base video frame with crop
      if (this.facingMode() === 'user') {
        ctx.save();
        ctx.translate(canvasElement.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
        ctx.restore();
      } else {
        ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
      }
      
      // Reset filter
      ctx.filter = 'none';
      
      if (this.isDualMode() && !this.dualFirstImage) {
        // Step 1 of Dual: Save first frame, flip camera, capture step 2
        const dataUrl = canvasElement.toDataURL('image/jpeg', 0.9);
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          this.dualFirstImage = img;
          this.toggleCamera(videoElement); // flip to the other side
          // Auto capture second frame after 1.5s
          setTimeout(async () => {
            const photo = await this.capturePhoto(videoElement, canvasElement);
            resolve(photo);
          }, 1500);
        };
        return;
      }

      if (this.isDualMode() && this.dualFirstImage) {
        // Step 2 of Dual: Draw Pip
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
        const pipW = canvasElement.width * 0.3;
        const pipH = (this.dualFirstImage.height / this.dualFirstImage.width) * pipW;
        
        // Draw border mapping
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(40, 40, pipW, pipH);
        ctx.drawImage(this.dualFirstImage, 40, 40, pipW, pipH);
        this.dualFirstImage = null; // reset
      }

      canvasElement.toBlob(blob => {
        if (!blob) return resolve(null);
        const file = new File([blob], `capture_${Date.now()}.webp`, { type: 'image/webp' });
        const url = URL.createObjectURL(file);
        const id = Date.now().toString();
        
        resolve({ id, url, file, isDual: this.isDualMode() });
      }, 'image/webp', 0.9);
    });
  }
}
