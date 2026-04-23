import { Component, Input, Output, EventEmitter, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

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
export class PhotoCropperComponent {
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
  readonly isCropLandscape = signal(false);

  @ViewChild('cropperScrollArea') cropperScrollArea?: ElementRef<HTMLDivElement>;
  @ViewChild('cropperImgElement') cropperImgElement?: ElementRef<HTMLImageElement>;

  onCropImgLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.isCropLandscape.set(img.naturalWidth > img.naturalHeight);
    
    setTimeout(() => {
        const scrollArea = this.cropperScrollArea?.nativeElement;
        if (scrollArea) {
           scrollArea.scrollLeft = (scrollArea.scrollWidth - scrollArea.clientWidth) / 2;
           scrollArea.scrollTop = (scrollArea.scrollHeight - scrollArea.clientHeight) / 2;
        }
    }, 50);
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
    if (!cropState) return;

    const scrollEl = this.cropperScrollArea?.nativeElement;
    const imgEl = this.cropperImgElement?.nativeElement;
    if (!scrollEl || !imgEl) return;

    const img = new Image();
    img.onload = () => {
        const scale = img.naturalWidth / imgEl.offsetWidth; 
        
        const sx = scrollEl.scrollLeft * scale;
        const sy = scrollEl.scrollTop * scale;
        const size = scrollEl.clientWidth * scale;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
            canvas.toBlob(blob => {
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
    };
    img.src = cropState.url;
  }

  private nextCrop() {
    this.cropQueue.update(q => q.slice(1));
    if (this.cropQueue().length === 0) {
      this.onComplete.emit();
    }
  }
}
