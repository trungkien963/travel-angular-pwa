import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Trip } from '../../core/models/trip.model';
import { Expense } from '../../core/models/expense.model';
import { Post } from '../../core/models/social.model';
import { CalculatorInputComponent } from '../../shared/components/calculator-input/calculator-input.component';

interface LocationResult {
  placeId: string;
  name: string;
  city: string;
  address: string;
}

export interface PhotoCapture {
  id: string;
  url: string;
  file: File;
  isDual: boolean;
}

import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-add-moment',
  standalone: true,
  imports: [FormsModule, CalculatorInputComponent, TranslatePipe],
  templateUrl: './add-moment.component.html',
  styleUrl: './add-moment.component.scss'
})
export class AddMomentComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private travelStore = inject(TravelStore);
  private supabase = inject(SupabaseService);
  private confirmService = inject(ConfirmService);

  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  // ─── Camera state ────────────────────────────────────────────────────────
  readonly cameraPhase = signal<'capture' | 'details'>('capture');
  readonly isCameraActive = signal(true);
  readonly facingMode = signal<'environment' | 'user'>('user');
  readonly isDualMode = signal(false);
  private stream: MediaStream | null = null;
  private dualFirstImage: HTMLImageElement | null = null;

  // New Camera Features
  readonly isFlashOn = signal(false);
  readonly showGrid = signal(false);
  readonly activeFilter = signal<'none' | 'film' | 'kodak' | 'y2k' | 'cine'>('none');
  
  videoDevices: MediaDeviceInfo[] = [];
  currentCameraId: string | null = null;

  // ─── Image state ─────────────────────────────────────────────────────────
  readonly photos = signal<PhotoCapture[]>([]);
  readonly viewingPhotoId = signal<string | null>(null);

  // Crop Interactive State
  readonly cropQueue = signal<{id: string, url: string, file: File}[]>([]);
  readonly cropTotal = signal(0);
  readonly currentCropIndex = computed(() => this.cropTotal() - this.cropQueue().length + 1);
  readonly currentCrop = computed(() => this.cropQueue()[0] || null);
  readonly isCropLandscape = signal(false);

  @ViewChild('cropperScrollArea') cropperScrollArea?: ElementRef<HTMLDivElement>;
  @ViewChild('cropperImgElement') cropperImgElement?: ElementRef<HTMLImageElement>;

  readonly viewingPhotoUrl = computed(() => {
    const p = this.photos().find(x => x.id === this.viewingPhotoId());
    return p ? p.url : null;
  });

  // ─── Form state ──────────────────────────────────────────────────────────
  caption = '';
  expenseAmount = 0;
  
  get formattedTotalAmount(): string {
    return this.expenseAmount ? this.formatNumber(this.expenseAmount) : '';
  }

  setTotalAmount(val: string) {
    // Strip non-numeric except % if needed (but total amount shouldn't have %)
    const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
    this.expenseAmount = isNaN(parsed) ? 0 : parsed;
  }

  showTripPicker = false;
  readonly isExpenseMode = signal(false);
  readonly isSubmitting = signal(false);

  readonly pendingReceipts = signal<{url: string, file?: File}[]>([]);
  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);
  readonly lightboxContext = signal<'PENDING' | 'SAVED' | 'PENDING_PHOTO' | null>(null);

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const arr = [...this.pendingReceipts()];
      for (let i = 0; i < input.files.length; i++) {
        arr.push({
           url: URL.createObjectURL(input.files[i]),
           file: input.files[i]
        });
      }
      this.pendingReceipts.set(arr);
    }
    input.value = '';
  }

  removeReceipt(index: number, event: Event) {
    event.stopPropagation();
    const arr = [...this.pendingReceipts()];
    arr.splice(index, 1);
    this.pendingReceipts.set(arr);
  }

  openLightbox(images: string[], index: number, context: 'PENDING' | 'SAVED' | 'PENDING_PHOTO' = 'SAVED') {
    this.lightboxImages.set(images);
    this.lightboxIndex.set(index);
    this.lightboxContext.set(context);
    setTimeout(() => {
      const container = document.querySelector('.lightbox-scroll') as HTMLElement;
      if (container) {
        container.scrollTo({ left: window.innerWidth * index, behavior: 'instant' });
      }
    }, 10);
  }
  
  openPendingReceiptViewer(index: number) {
    const urls = this.pendingReceipts().map(r => r.url);
    this.openLightbox(urls, index, 'PENDING');
  }

  removeCurrentLightboxImage() {
    const idx = this.lightboxIndex();
    const ctx = this.lightboxContext();
    if (idx === null || (ctx !== 'PENDING' && ctx !== 'PENDING_PHOTO')) return;
    
    if (ctx === 'PENDING') {
      const arr = [...this.pendingReceipts()];
      arr.splice(idx, 1);
      this.pendingReceipts.set(arr);
      
      const newUrls = arr.map(r => r.url);
      if (newUrls.length === 0) {
        this.lightboxIndex.set(null);
        this.lightboxImages.set([]);
      } else {
        this.lightboxImages.set(newUrls);
        const nextIdx = Math.min(idx, newUrls.length - 1);
        this.lightboxIndex.set(nextIdx);
      }
    } else if (ctx === 'PENDING_PHOTO') {
      const arr = [...this.photos()];
      arr.splice(idx, 1);
      this.photos.set(arr);
      
      const newUrls = arr.map(r => r.url);
      if (newUrls.length === 0) {
        this.lightboxIndex.set(null);
        this.lightboxImages.set([]);
      } else {
        this.lightboxImages.set(newUrls);
        const nextIdx = Math.min(idx, newUrls.length - 1);
        this.lightboxIndex.set(nextIdx);
      }
    }
  }

  onLightboxScroll(event: Event) {
    const el = event.target as HTMLElement;
    const idx = Math.round(el.scrollLeft / window.innerWidth);
    const imgs = this.lightboxImages();
    if (imgs && idx >= 0 && idx < imgs.length) {
      if (this.lightboxIndex() !== idx) {
        this.lightboxIndex.set(idx);
      }
    }
  }
  
  canSubmit(): boolean {
    if (this.photos().length === 0) return false;
    if (!this.selectedTripId()) return false;
    
    if (this.isExpenseMode()) {
      if (!this.caption || !this.caption.trim()) return false;
      if (!this.expenseAmount || this.expenseAmount <= 0) return false;
      if (!this.paidById()) return false; 
    }
    return true;
  }

  readonly selectedTripId = signal<string | null>(null);
  
  // Expense specific
  readonly paidById = signal('');
  readonly includedMembers = signal<Record<string, boolean>>({});
  readonly activeMemberCount = computed(() => {
    const inc = this.includedMembers();
    return Object.values(inc).filter(v => v).length;
  });
  readonly lockedShares = signal<Record<string, number | null>>({});
  readonly editingMemberId = signal<string | null>(null);

  // Directly add members
  newMemberEmail = '';
  readonly isInviting = signal(false);
  
  readonly expenseCategories = [
    { id: 'FOOD', icon: '🍔', label: 'Food' },
    { id: 'TRANSPORT', icon: '🚕', label: 'Transport' },
    { id: 'HOTEL', icon: '🏨', label: 'Hotel' },
    { id: 'ACTIVITIES', icon: '🎯', label: 'Activities' },
    { id: 'SHOPPING', icon: '🛍️', label: 'Shopping' },
    { id: 'OTHER', icon: '💳', label: 'Other' }
  ];
  readonly selectedCategory = signal('FOOD');

  // ─── Location state ───────────────────────────────────────────────────────
  locationQuery = '';
  selectedLocation: LocationResult | null = null;
  readonly isSearching = signal(false);
  readonly locationResults = signal<LocationResult[]>([]);
  private locationTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Derived ──────────────────────────────────────────────────────────────
  readonly trips = computed(() => this.travelStore.myTrips());
  readonly selectedTrip = computed<Trip | null>(() => {
    const id = this.selectedTripId();
    return id ? (this.trips().find(t => t.id === id) ?? null) : null;
  });
  readonly pendingNewMembers = signal<any[]>([]);
  readonly currentTripMembers = computed(() => {
    if (this.selectedTripId() === 'NEW_TRIP') {
      const me = {
         id: this.travelStore.currentUserId(),
         name: this.travelStore.currentUserProfile()?.name || 'You',
         email: '', // email could be fetched from auth if needed
         isMe: true,
         avatar: this.travelStore.currentUserProfile()?.avatar
      };
      return [me, ...this.pendingNewMembers()];
    }
    return [...(this.selectedTrip()?.members ?? []), ...this.pendingNewMembers()];
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    if (this.travelStore.myTrips().length === 0) {
      await this.travelStore.initSupabase();
    }
    const paramTripId = this.route.snapshot.queryParamMap.get('tripId');
    if (paramTripId) {
      this.selectedTripId.set(paramTripId);
    } else {
      this.autoSelectTrip();
    }
    this.paidById.set(this.travelStore.currentUserId());
    
    // Start camera by default
    setTimeout(() => this.startCamera(), 100);
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  private autoSelectTrip() {
    const todayStr = new Date().toISOString().split('T')[0];
    const trips = this.trips();
    if (trips.length === 0) {
      this.selectedTripId.set('NEW_TRIP');
      this.setupIncludedMembers('NEW_TRIP');
      return;
    }

    const today = new Date();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    
    // Find trips within +/- 10 days
    const nearbyTrips = trips.filter(t => {
       const d = new Date(t.startDate);
       return Math.abs(today.getTime() - d.getTime()) <= tenDaysMs;
    });

    if (nearbyTrips.length === 0) {
       this.selectedTripId.set('NEW_TRIP');
       this.setupIncludedMembers('NEW_TRIP');
       return;
    }

    const ongoing = nearbyTrips.find(t => t.startDate <= todayStr && t.endDate >= todayStr);
    if (ongoing) {
      this.selectedTripId.set(ongoing.id);
      this.setupIncludedMembers(ongoing.id);
    } else {
      let closest = nearbyTrips[0];
      let minDiff = Infinity;
      nearbyTrips.forEach(t => {
        const diff = Math.abs(today.getTime() - new Date(t.startDate).getTime());
        if (diff < minDiff) { minDiff = diff; closest = t; }
      });
      this.selectedTripId.set(closest.id);
      this.setupIncludedMembers(closest.id);
    }
  }

  private setupIncludedMembers(tripId: string) {
    if (tripId === 'NEW_TRIP') {
      this.includedMembers.set({ [this.travelStore.currentUserId()]: true });
      return;
    }
    const trip = this.trips().find(t => t.id === tripId);
    if (!trip) return;
    const included: Record<string, boolean> = {};
    trip.members.forEach(m => included[m.id] = true);
    this.includedMembers.set(included);
  }

  // ─── Native WebRTC Camera ─────────────────────────────────────────────────
  async startCamera() {
    this.stopCamera();
    this.isCameraActive.set(true);
    
    const isPortrait = window.innerHeight > window.innerWidth;
    const constraints: any = {
      width: { ideal: isPortrait ? 1080 : 1440 },
      height: { ideal: isPortrait ? 1440 : 1080 }
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
      this.onStreamActive();
    } catch (err: any) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        // Fallback if specific camera/mode fails
        console.warn('Camera constraint failed, falling back to any device');
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          this.onStreamActive();
        } catch (e2) {
          console.error('Fallback camera failed', e2);
        }
      } else {
        console.warn('Camera access denied or unavailable', err);
      }
    }
  }

  private async onStreamActive() {
    // Update devices after granting permission
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.videoDevices = devices.filter(d => d.kind === 'videoinput');

    this.applyFlash();

    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.srcObject = this.stream;
      this.videoElement.nativeElement.play().catch((e: any) => console.warn('Play interrupted', e));
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  toggleCamera() {
    this.facingMode.update(m => m === 'environment' ? 'user' : 'environment');
    this.currentCameraId = null; // Reset explicit lens when flipping
    this.startCamera();
  }

  hasMultipleBackCameras(): boolean {
    return this.videoDevices.filter(d => !d.label.toLowerCase().includes('front')).length > 1;
  }

  cycleLens() {
    const backs = this.videoDevices.filter(d => !d.label.toLowerCase().includes('front'));
    if (backs.length < 2) return;
    let idx = backs.findIndex(d => d.deviceId === this.currentCameraId);
    idx = (idx + 1) % backs.length;
    this.currentCameraId = backs[idx].deviceId;
    this.facingMode.set('environment');
    this.startCamera();
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

  async capturePhoto() {
    if (!this.videoElement || !this.canvasElement) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    
    // Ensure we crop the raw video feed to match the exact framing shown in the UI (object-fit: cover)
    const displayWidth = video.offsetWidth;
    const displayHeight = video.offsetHeight;
    
    const videoRatio = video.videoWidth / video.videoHeight;
    const displayRatio = displayWidth / displayHeight;

    let targetWidth, targetHeight;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

    if (videoRatio > displayRatio) {
      targetHeight = video.videoHeight;
      targetWidth = video.videoHeight * displayRatio;
      sw = targetWidth;
      sx = (video.videoWidth - sw) / 2;
    } else {
      targetWidth = video.videoWidth;
      targetHeight = video.videoWidth / displayRatio;
      sh = targetHeight;
      sy = (video.videoHeight - sh) / 2;
    }

    canvas.width = targetWidth || 1080;
    canvas.height = targetHeight || 1080;
    const ctx = (canvas as any).getContext('2d', { colorSpace: 'display-p3' }) || canvas.getContext('2d');
    if (!ctx) return;
    
    // Remove scaling to prevent mirrored (flipped) result
    // if (this.facingMode() === 'user') {
    //   ctx.translate(canvas.width, 0);
    //   ctx.scale(-1, 1);
    // }

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

    // Draw base video frame
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    
    // Reset filter
    ctx.filter = 'none';
    
    if (this.isDualMode() && !this.dualFirstImage) {
      // Step 1 of Dual: Save first frame, flip camera, capture step 2
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        this.dualFirstImage = img;
        this.toggleCamera(); // flip to the other side
        // Auto capture second frame after 1.5s
        setTimeout(() => {
          this.capturePhoto();
        }, 1500);
      };
      return;
    }

    if (this.isDualMode() && this.dualFirstImage) {
      // Step 2 of Dual: Draw Pip
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      const pipW = canvas.width * 0.3;
      const pipH = (this.dualFirstImage.height / this.dualFirstImage.width) * pipW;
      
      // Draw border mapping
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(40, 40, pipW, pipH);
      ctx.drawImage(this.dualFirstImage, 40, 40, pipW, pipH);
      this.dualFirstImage = null; // reset
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.webp`, { type: 'image/webp' });
      const url = URL.createObjectURL(file);
      const id = Date.now().toString();
      
      this.photos.update(p => [{ id, url, file, isDual: this.isDualMode() }, ...p]);
      // Do not stop camera, always go back to new photo
    }, 'image/webp', 0.9);
  }

  viewPhoto(id: string) {
    const arr = this.photos();
    const idx = arr.findIndex(p => p.id === id);
    if (idx >= 0) {
      this.openLightbox(arr.map(p => p.url), idx, 'PENDING_PHOTO');
    }
  }

  goToDetails() {
    this.cameraPhase.set('details');
  }

  goToCapture() {
    this.cameraPhase.set('capture');
  }

  closePreviewPopup() {
    this.viewingPhotoId.set(null);
  }

  deleteCurrentPreview() {
    const id = this.viewingPhotoId();
    if (id) {
       this.photos.update(arr => arr.filter(p => p.id !== id));
       this.closePreviewPopup();
    }
  }

  removePhoto(id: string, event: Event) {
    event.stopPropagation();
    this.photos.update(arr => arr.filter(p => p.id !== id));
    if (this.viewingPhotoId() === id) {
      this.closePreviewPopup();
    }
  }

  // Gallery fallback
  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    
    // Đẩy toàn bộ ảnh vào hàng đợi (queue) để crop thủ công
    const arr = Array.from(input.files).map(file => ({
       file: file,
       url: URL.createObjectURL(file), // Temp URL for cropping
       id: Date.now().toString() + Math.random()
    }));
    
    this.cropTotal.set(arr.length);
    this.cropQueue.set(arr);
    this.goToCapture(); // Đảm bảo đang ở màn Camera
    input.value = '';
  }

  onCropImgLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.isCropLandscape.set(img.naturalWidth > img.naturalHeight);
    
    // Căn giữa vị trí Scroll ngay khi load ảnh
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
    this.cropQueue.update(q => q.slice(1));
  }

  abortCropSession() {
    this.cropQueue().forEach(c => URL.revokeObjectURL(c.url));
    this.cropQueue.set([]);
    this.cropTotal.set(0);
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
        const size = scrollEl.clientWidth * scale; // 1:1 ratio

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
                    this.photos.update(p => [{ id: cropState.id, url, file: croppedFile, isDual: false }, ...p]);
                 }
                 URL.revokeObjectURL(cropState.url);
                 this.cropQueue.update(q => q.slice(1)); // Chuyển sang ảnh tiếp theo
            }, 'image/webp', 0.9);
        } else {
             this.cropQueue.update(q => q.slice(1));
        }
    };
    img.src = cropState.url;
  }

  // ─── Trip & Form ──────────────────────────────────────────────────────────
  selectTrip(id: string) {
    this.selectedTripId.set(id);
    this.showTripPicker = false;
    this.setupIncludedMembers(id);
    if (!this.paidById()) this.paidById.set(this.travelStore.currentUserId());
  }

  toggleExpenseMode() {
    this.isExpenseMode.update(v => !v);
    if (this.isExpenseMode()) {
      const members = this.currentTripMembers();
      const included: Record<string, boolean> = {};
      members.forEach(m => included[m.id] = true);
      this.includedMembers.set(included);
    }
  }

  toggleMember(id: string) {
    this.includedMembers.update(m => ({ ...m, [id]: !m[id] }));
    if (!this.includedMembers()[id]) {
       this.lockedShares.update(m => ({ ...m, [id]: null })); 
    }
    
    this.lockedShares.update(locks => {
      const newLocks = { ...locks };
      const inc = this.includedMembers();
      const active = Object.keys(inc).filter(k => inc[k]);
      
      if (active.length <= 1) {
         active.forEach(k => newLocks[k] = null);
         return newLocks;
      }

      const floats = active.filter(k => newLocks[k] == null);
      if (active.length > 0 && floats.length === 0) {
        active.forEach(k => newLocks[k] = null);
      }
      return newLocks;
    });
  }

  startEdit(memberId: string) {
    this.editingMemberId.set(memberId);
  }

  setLockedAmount(memberId: string, value: string) {
    this.editingMemberId.set(null);
    this.updateLockedValue(memberId, value);
  }

  setLockedAmountNum(memberId: string, value: number | null) {
    this.lockedShares.update(m => ({ ...m, [memberId]: value }));
    this.updateLockedValue(memberId, value == null ? '' : value.toString());
  }

  onMemberShareCommit(memberId: string, value: number | null) {
    if (value === 0) {
      this.includedMembers.update(m => ({ ...m, [memberId]: false }));
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      this.updateLockedValue(memberId, '');
    }
  }

  updateLockedValue(memberId: string, value: string) {
    const val = value.trim();
    const inc = this.includedMembers();
    const active = Object.keys(inc).filter(k => inc[k]);

    if (!val || active.length <= 1) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      return;
    }
    
    let num = 0;
    if (val.endsWith('%')) {
      const pct = parseFloat(val) / 100;
      num = (this.expenseAmount || 0) * pct;
    } else {
      num = parseFloat(val.replace(/[^0-9.]/g, ''));
    }
    
    if (isNaN(num)) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
    } else {
      this.lockedShares.update(locks => {
        const newLocks = { ...locks, [memberId]: Math.round(num) };
        const floats = active.filter(k => newLocks[k] == null);
        if (active.length > 0 && floats.length === 0) {
          active.forEach(k => {
            if (k !== memberId) newLocks[k] = null;
          });
        }
        return newLocks;
      });
    }
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    
    if (this.activeMemberCount() === 1) {
      return this.expenseAmount || 0;
    }

    const lockedAmount = this.lockedShares()[memberId];
    if (lockedAmount !== undefined && lockedAmount !== null) {
      return lockedAmount;
    }

    const total = this.expenseAmount || 0;
    let totalLocked = 0;
    let floatCount = 0;

    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l !== undefined && l !== null) {
          totalLocked += l;
        } else {
          floatCount++;
        }
      }
    });

    let remainder = total - totalLocked;
    return floatCount > 0 ? Math.round(Math.max(0, remainder) / floatCount) : 0;
  }

  isSplitExceedingTotal(): boolean {
    if (this.activeMemberCount() <= 1) return false;
    const total = this.expenseAmount || 0;
    let totalLocked = 0;
    Object.keys(this.includedMembers()).forEach(id => {
      if (this.includedMembers()[id]) {
        const l = this.lockedShares()[id];
        if (l != null) totalLocked += l;
      }
    });
    return totalLocked > total;
  }

  onInputSplitAmount(memberId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const val = input.value.trim();
    if (val.endsWith('%')) {
      // let it be
    } else {
      const raw = val.replace(/[^0-9]/g, '');
      const num = parseInt(raw, 10);
      if (!isNaN(num)) {
        input.value = num.toLocaleString('en-US');
      } else {
        input.value = '';
      }
    }
    this.updateLockedValue(memberId, input.value);
  }

  // ─── Direct Member Invite ──────────────────────────────────────────────────
  async quickInviteMember() {
    const email = this.newMemberEmail.trim();
    if (!email) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.toastService.show('Invalid email format.', 'error');
      return;
    }

    const trip = this.selectedTrip();
    if (!trip) return;

    if (trip.members.some(m => m.email === email) || this.pendingNewMembers().some(m => m.email === email)) {
      this.toastService.show('Member already in trip or pending.', 'error');
      return;
    }

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
    const newMember = { id: tempId, name: email.split('@')[0], email, isMe: false, avatar: undefined };
    
    this.pendingNewMembers.update(list => [...list, newMember]);
    this.includedMembers.update(m => ({ ...m, [tempId]: true }));
    this.newMemberEmail = '';
  }

  // ─── Location search ─────────────────────────────────────────────────────
  onLocationSearch() {
    if (this.locationTimer) clearTimeout(this.locationTimer);
    const q = this.locationQuery.trim();
    if (q.length < 2) { this.locationResults.set([]); return; }
    this.locationTimer = setTimeout(async () => {
      this.isSearching.set(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, { headers: { 'Accept-Language': 'en' } });
        const data: any[] = await res.json();
        this.locationResults.set(data.map(d => ({
          placeId: d.place_id.toString(),
          name: d.display_name.split(',')[0].trim(),
          city: d.display_name.split(',').slice(1, 3).join(',').trim(),
          address: d.display_name
        })));
      } catch { this.locationResults.set([]); } finally { this.isSearching.set(false); }
    }, 400);
  }

  selectLocation(r: LocationResult) {
    this.selectedLocation = r;
    this.locationQuery = '';
    this.locationResults.set([]);
  }

  clearLocation() {
    this.selectedLocation = null;
    this.locationQuery = '';
  }

  // ─── Submit ──────────────────────────────────────────────────────────
  async submit() {
    let tripId = this.selectedTripId();
    if (!tripId) { this.toastService.show('Please select a trip first.', 'error'); return; }
    
    if (this.photos().length === 0 && !this.caption) {
      this.toastService.show('Chưa có nội dung hoặc hình ảnh.', 'error'); return;
    }

    const db = this.supabase.client;
    const uid = this.travelStore.currentUserId();
    
    // Process pending members before submitting
    const pending = this.pendingNewMembers().filter(p => this.includedMembers()[p.id]);
    let idMap: Record<string, string> = {}; // maps tempId -> realId
    if (pending.length > 0) {
      const emailListHtml = pending.map(p => `• <strong>${p.email}</strong>`).join('<br>');
      const msgHtml = `Có <b>${pending.length}</b> người mới vừa được thêm vào chưa nhận được thư mời:<br><br>${emailListHtml}<br><br>Bạn có muốn gửi lời mời cho họ tham gia trip này?`;
      
      const confirmed = await this.confirmService.confirm(
        msgHtml,
        'Mời người mới?',
        'Yes, Invite',
        'Huỷ bỏ'
      );
      if (!confirmed) {
        return; // Abort submission
      }
    }

    this.pendingNewMembers.set([]);
    this.isSubmitting.set(true);

    let trip: Trip | null = this.selectedTrip();
    let isAutoGeneratedTrip = false;

    try {
      if (tripId === 'NEW_TRIP') {
        const todayStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const defaultName = `Chuyến đi ngày ${todayStr}`;
        const todaySqlStr = new Date().toISOString().split('T')[0];
        
        const newTripPayload = {
          title: defaultName,
          start_date: todaySqlStr,
          end_date: todaySqlStr,
          cover_image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop',
          owner_id: uid,
          is_private: true,
          members: [
            {
              id: uid,
              name: this.travelStore.currentUserProfile()?.name || 'You',
              email: '', 
              isMe: true,
              avatar: this.travelStore.currentUserProfile()?.avatar
            }
          ]
        };

        const { data: createdTripData, error: createErr } = await db.from('trips').insert(newTripPayload).select().single();
        if (createErr || !createdTripData) throw new Error('Không thể tạo chuyến đi tự động.');
        
        tripId = createdTripData.id;
        trip = {
           id: tripId,
           title: defaultName,
           startDate: todaySqlStr,
           endDate: todaySqlStr,
           coverImage: newTripPayload.cover_image,
           ownerId: uid,
           isPrivate: true,
           members: newTripPayload.members as any
        } as Trip;
        isAutoGeneratedTrip = true;
      }

      if (!trip) throw new Error('Không tìm thấy dữ liệu chuyến đi');

      if (pending.length > 0) {
        // Prepare to invite
        const resolvedMembers: any[] = [];
        for (const p of pending) {
          let userId: string | null = null;
          let userName = p.name;
          let userAvatar: string | undefined = p.avatar;
          
          try {
            const { data, error } = await db.functions.invoke('invite-member', { body: { email: p.email } });
            if (!error && data?.userId) {
              userId = data.userId;
              try {
                const { data: userData } = await db.from('users').select('full_name, avatar_url').eq('id', userId).maybeSingle();
                if (userData?.['full_name']) userName = userData['full_name'];
                if (userData?.['avatar_url']) userAvatar = userData['avatar_url'];
              } catch(e) {}
            }
          } catch(err) { console.warn('Invite fail', p.email, err); }
          
          if (!userId) userId = crypto.randomUUID();
          
          idMap[p.id] = userId;
          resolvedMembers.push({ ...p, id: userId, name: userName, avatar: userAvatar });
        }
        
        // Update Trip in DB
        const updatedTripMembers = [...trip.members, ...resolvedMembers];
        await db.from('trips').update({ members: updatedTripMembers }).eq('id', trip.id);
        this.travelStore.updateTrip(trip.id, { members: updatedTripMembers });
        
        // Map local toggle state logic to the new real IDs
        const newIncludes: Record<string, boolean> = {};
        const newLocks: Record<string, number | null> = {};
        
        Object.keys(this.includedMembers()).forEach(k => {
          const mapId = idMap[k] || k;
          newIncludes[mapId] = this.includedMembers()[k];
        });
        Object.keys(this.lockedShares()).forEach(k => {
          const mapId = idMap[k] || k;
          newLocks[mapId] = this.lockedShares()[k];
        });

        // if paidById was a pending user, update it
        if (idMap[this.paidById()]) {
          this.paidById.set(idMap[this.paidById()]);
        }
        
        this.includedMembers.set(newIncludes);
        this.lockedShares.set(newLocks);
    }
      const uploadedUrls: string[] = [];
      let isAnyDual = false;
      for (const p of this.photos()) {
        const path = `posts/${uid}/${p.id}_${p.file.name}`;
        const { data } = await db.storage.from('nomadsync-media').upload(path, p.file, { upsert: true });
        if (data) {
          const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
          uploadedUrls.push(urlData.publicUrl);
          if (p.isDual) isAnyDual = true;
        }
      }

      if (this.isExpenseMode() && this.expenseAmount > 0) {
        const splits: Record<string, number> = {};
        let totalAssigned = 0;
        let lastMemberId: string | null = null;
        
        this.currentTripMembers().forEach(m => { 
          if (this.includedMembers()[m.id]) {
            const share = this.calcShare(m.id);
            splits[m.id] = share;
            totalAssigned += share;
            lastMemberId = m.id;
          }
        });
        
        // Zero-sum Validation: Absorb penny-drop rounding error into the last person's share
        if (lastMemberId && totalAssigned !== this.expenseAmount) {
           splits[lastMemberId] += (this.expenseAmount - totalAssigned);
        }

        let finalReceiptUrls: string[] = [];
        const currentReceipts = this.pendingReceipts();
        for (const rec of currentReceipts) {
           if (rec.file) {
              const rPath = `receipts/${uid}/${Date.now()}_${rec.file.name.replace(/[^a-zA-Z0-9.\-]/g,'_')}`;
              const { data: rData } = await db.storage.from('nomadsync-media').upload(rPath, rec.file, { upsert: true });
              if (rData) {
                 const { data: rUrlData } = db.storage.from('nomadsync-media').getPublicUrl(rPath);
                 finalReceiptUrls.push(rUrlData.publicUrl);
              }
           } else {
              finalReceiptUrls.push(rec.url);
           }
        }

        const payload = {
          trip_id: tripId, description: this.caption || 'Untitled Expense', amount: this.expenseAmount,
          category: this.selectedCategory(), payer_id: this.paidById(),
          splits, receipt_urls: finalReceiptUrls
        };
        const { data } = await db.from('expenses').insert(payload).select().single();
        if (data) {
          this.travelStore.upsertExpense({
            id: data['id'], tripId: data['trip_id'], desc: data['description'], amount: data['amount'],
            category: data['category'], payerId: data['payer_id'], date: data['date'], splits: data['splits']
          } as Expense);
        }
      }
      
      // Always create a post so it shows up in the SOCIAL feed
      const member = trip?.members.find(m => m.id === uid);
      const authorName = this.travelStore.currentUserProfile()?.name || member?.name || 'Traveler';

      const postPayload = {
        trip_id: tripId, user_id: uid, content: this.caption, image_urls: uploadedUrls,
        is_dual_camera: isAnyDual, location_name: this.selectedLocation?.name ?? null,
        location_city: this.selectedLocation?.city ?? null, likes: [], comments: []
      };
      const { data: postData } = await db.from('posts').insert(postPayload).select().single();
      if (postData) {
        this.travelStore.addPost({
          id: postData['id'], tripId: postData['trip_id'], authorId: uid, authorName,
          content: postData['content'], images: postData['image_urls'] ?? [], isDual: postData['is_dual_camera'],
          timestamp: postData['created_at'], date: postData['created_at']?.split('T')[0],
          likes: 0, hasLiked: false, comments: []
        } as Post);
      }

      // Navigate appropriately based on whether it was an expense
      if (isAutoGeneratedTrip) {
        this.toastService.show(`✅ Đã lưu khoảnh khắc! Hệ thống vừa tự động tạo '${trip.title}' cho bạn.`, 'success');
        this.travelStore.refreshData(); // To cleanly bring in the new trip from DB
      }

      if (this.isExpenseMode() && this.expenseAmount > 0) {
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'EXPENSES' } });
      } else {
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'SOCIAL' } });
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Lỗi khi submit.', 'error');
      this.isSubmitting.set(false);
    }
  }

  async handleClose() {
    if (this.photos().length > 0 || this.caption) {
      const confirmed = await this.confirmService.confirm('Hủy bỏ bài đăng này?');
      if (!confirmed) return;
    }
    history.length > 1 ? history.back() : this.router.navigate(['/discover']);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatNumber(val: number): string { return val.toLocaleString('en-US'); }
}
