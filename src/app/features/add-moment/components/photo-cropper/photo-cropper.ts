import { Component, Input, Output, EventEmitter, signal, computed, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import Cropper from 'cropperjs';

export interface CropTask {
  id: string;
  url: string;
  file: File;
}

export interface CroppedResult {
  id: string;
  url: string;
  file: File;
  isDual: boolean;
}

@Component({
  selector: 'app-photo-cropper',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './photo-cropper.html',
  styleUrl: './photo-cropper.scss'
})
export class PhotoCropperComponent implements OnDestroy {
  @Input() set tasks(value: CropTask[]) {
    this.cropTotal.set(value.length);
    this.cropQueue.set(value);
  }

  @Output() onCropped = new EventEmitter<CroppedResult>();
  @Output() onAbort = new EventEmitter<void>();
  @Output() onComplete = new EventEmitter<void>();

  readonly cropQueue = signal<CropTask[]>([]);
  readonly cropTotal = signal(0);
  readonly currentCropIndex = computed(() => this.cropTotal() - this.cropQueue().length + 1);
  readonly currentCrop = computed(() => this.cropQueue()[0] || null);

  @ViewChild('cropperImgElement') cropperImgElement?: ElementRef<HTMLImageElement>;

  private cropperInstance: Cropper | null = null;

  ngOnDestroy() {
    this.destroyCropper();
  }

  onCropImgLoad(event: Event) {
    this.initCropper();
  }

  private initCropper() {
    if (!this.cropperImgElement?.nativeElement) return;
    this.destroyCropper();

    this.cropperInstance = new Cropper(this.cropperImgElement.nativeElement, {
      viewMode: 3,
      dragMode: 'move',
      aspectRatio: 1,
      cropBoxMovable: false,
      cropBoxResizable: false,
      autoCropArea: 1,
      background: false,
      guides: true,
      center: false,
      highlight: false,
      toggleDragModeOnDblclick: false,
    });
  }

  private destroyCropper() {
    if (this.cropperInstance) {
      this.cropperInstance.destroy();
      this.cropperInstance = null;
    }
  }

  skipCrop() {
    const cropState = this.currentCrop();
    if (cropState) {
       URL.revokeObjectURL(cropState.url);
    }
    this.nextCrop();
  }

  abortCropSession() {
    this.cropQueue().forEach(c => URL.revokeObjectURL(c.url));
    this.cropQueue.set([]);
    this.cropTotal.set(0);
    this.onAbort.emit();
  }

  confirmCrop() {
    const cropState = this.currentCrop();
    if (!cropState || !this.cropperInstance) return;

    const canvas = this.cropperInstance.getCroppedCanvas({
        width: 1080,
        height: 1080,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    if (canvas) {
        canvas.toBlob((blob: Blob | null) => {
             if (blob) {
                const croppedFile = new File([blob], `gallery_${Date.now()}.webp`, { type: 'image/webp' });
                const url = URL.createObjectURL(croppedFile);
                this.onCropped.emit({ id: cropState.id, url, file: croppedFile, isDual: false });
             }
             URL.revokeObjectURL(cropState.url);
             this.nextCrop();
        }, 'image/webp', 0.9);
    } else {
         this.nextCrop();
    }
  }

  private nextCrop() {
    this.cropQueue.update(q => q.slice(1));
    this.destroyCropper();
    if (this.cropQueue().length === 0) {
      this.onComplete.emit();
    }
  }
}
