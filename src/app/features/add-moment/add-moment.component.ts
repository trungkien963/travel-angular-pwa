import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { formatNumber, formatDate } from '../../core/utils/format.util';
import { AddMomentService } from './services/add-moment.service';
import { CameraService, PhotoCapture } from '../../core/services/camera.service';
import { LocationService, LocationResult } from '../../core/services/location.service';
import { SwipeToCloseDirective } from '../../shared/directives/swipe-to-close.directive';
import { PhotoCropperComponent, CropTask, CroppedResult } from './components/photo-cropper/photo-cropper';
import { AddExpenseFormComponent, ExpenseFormData } from './components/add-expense-form/add-expense-form';
import { LocationSearchComponent } from './components/location-search/location-search';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-add-moment',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, PhotoCropperComponent, AddExpenseFormComponent, LocationSearchComponent],
  templateUrl: './add-moment.component.html',
  styleUrl: './add-moment.component.scss'
})
export class AddMomentComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  readonly travelStore = inject(TravelStore);
  private supabase = inject(SupabaseService);
  private confirmService = inject(ConfirmService);
  private addMomentService = inject(AddMomentService);
  private cameraService = inject(CameraService);
  private locationService = inject(LocationService);

  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;
  @ViewChild(AddExpenseFormComponent) expenseForm?: AddExpenseFormComponent;

  // ─── Camera state ────────────────────────────────────────────────────────
  readonly cameraPhase = signal<'capture' | 'details'>('capture');
  
  readonly isCameraActive = this.cameraService.isCameraActive;
  readonly facingMode = this.cameraService.facingMode;
  readonly isDualMode = this.cameraService.isDualMode;
  readonly isFlashOn = this.cameraService.isFlashOn;
  readonly activeFilter = signal<'none'|'film'|'kodak'|'y2k'|'cine'>('none');
  readonly showGrid = signal(false);

  get videoDevices() { return this.cameraService.videoDevices; }
  get currentCameraId() { return this.cameraService.currentCameraId; }

  // ─── Image state ─────────────────────────────────────────────────────────
  readonly photos = signal<PhotoCapture[]>([]);
  readonly viewingPhotoId = signal<string | null>(null);

  // Crop Queue
  readonly cropQueue = signal<CropTask[]>([]);

  readonly viewingPhotoUrl = computed(() => {
    const p = this.photos().find(x => x.id === this.viewingPhotoId());
    return p ? p.url : null;
  });

  // ─── Form state ──────────────────────────────────────────────────────────
  caption = '';
  
  showTripPicker = false;
  readonly isExpenseMode = signal(false);
  readonly isSubmitting = signal(false);

  readonly lightboxImages = signal<string[]>([]);
  readonly lightboxIndex = signal<number | null>(null);
  readonly lightboxContext = signal<'PENDING' | 'SAVED' | 'PENDING_PHOTO' | null>(null);



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
  


  removeCurrentLightboxImage() {
    const idx = this.lightboxIndex();
    const ctx = this.lightboxContext();
    if (idx === null || (ctx !== 'PENDING' && ctx !== 'PENDING_PHOTO')) return;
    
    if (ctx === 'PENDING') {
      if (this.expenseForm) {
        // Mocking an event to satisfy the removeReceipt method
        this.expenseForm.removeReceipt(idx, new Event('click'));
      }
      
      const newUrls = this.expenseForm ? this.expenseForm.pendingReceipts().map(r => r.url) : [];
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
      if (!this.expenseData) return false;
      if (this.expenseData.hasPendingEmailInput) return false;
      if (!this.expenseData.isValid) return false;
    }
    return true;
  }

  readonly selectedTripId = signal<string | null>(null);
  
  // Expense Form State
  expenseData: ExpenseFormData | null = null;
  readonly isInviting = signal(false);


  // ─── Location state ───────────────────────────────────────────────────────
  selectedLocation: LocationResult | null = null;

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
    
    // Start camera by default
    setTimeout(() => {
      if (this.videoElement) this.cameraService.startCamera(this.videoElement.nativeElement);
    }, 100);

    this.lockOrientation();
  }

  ngOnDestroy() {
    this.cameraService.stopCamera();
    this.unlockOrientation();
  }

  private lockOrientation() {
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('portrait').catch((err: any) => {
          console.warn('Orientation lock failed:', err);
        });
      }
    } catch (e) {}
  }

  private unlockOrientation() {
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (e) {}
  }

  private autoSelectTrip() {
    const todayStr = new Date().toISOString().split('T')[0];
    const trips = this.trips();
    if (trips.length === 0) {
      this.selectedTripId.set('NEW_TRIP');
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
       return;
    }

    const ongoing = nearbyTrips.find(t => t.startDate <= todayStr && t.endDate >= todayStr);
    if (ongoing) {
      this.selectedTripId.set(ongoing.id);
    } else {
      let closest = nearbyTrips[0];
      let minDiff = Infinity;
      nearbyTrips.forEach(t => {
        const diff = Math.abs(today.getTime() - new Date(t.startDate).getTime());
        if (diff < minDiff) { minDiff = diff; closest = t; }
      });
      this.selectedTripId.set(closest.id);
    }
  }

  // ─── Native WebRTC Camera ─────────────────────────────────────────────────
  startCamera() {
    if (this.videoElement) this.cameraService.startCamera(this.videoElement.nativeElement);
  }

  stopCamera() {
    this.cameraService.stopCamera();
  }

  toggleCamera() {
    if (this.videoElement) this.cameraService.toggleCamera(this.videoElement.nativeElement);
  }

  hasMultipleBackCameras(): boolean {
    return this.cameraService.hasMultipleBackCameras();
  }

  cycleLens() {
    if (this.videoElement) this.cameraService.cycleLens(this.videoElement.nativeElement);
  }

  toggleFlash() {
    this.cameraService.toggleFlash();
  }

  toggleDualMode() {
    this.cameraService.toggleDualMode();
  }

  async capturePhoto() {
    if (!this.videoElement || !this.canvasElement) return;
    const photo = await this.cameraService.capturePhoto(this.videoElement.nativeElement, this.canvasElement.nativeElement);
    if (photo) {
      this.photos.update(p => [photo, ...p]);
    }
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
    
    // Create Crop Tasks
    const arr = Array.from(input.files).map(file => ({
       file: file,
       url: URL.createObjectURL(file), // Temp URL for cropping
       id: Date.now().toString() + Math.random()
    }));
    
    this.cropQueue.set(arr);
    this.goToCapture(); // Ensure we are on camera screen to show cropper
    input.value = '';
  }

  onPhotoCropped(result: CroppedResult) {
    this.photos.update(p => [result, ...p]);
  }

  onCropAbort() {
    this.cropQueue.set([]);
  }

  onCropComplete() {
    this.cropQueue.set([]);
  }

  // ─── Trip & Form ──────────────────────────────────────────────────────────
  selectTrip(id: string) {
    this.selectedTripId.set(id);
    this.showTripPicker = false;
  }

  toggleExpenseMode() {
    this.isExpenseMode.update(v => !v);
  }

  onExpenseFormChange(data: ExpenseFormData) {
    this.expenseData = data;
  }

  onExpenseReceiptViewer(event: {urls: string[], index: number}) {
    this.openLightbox(event.urls, event.index, 'PENDING');
  }

  // ─── Direct Member Invite ──────────────────────────────────────────────────
  async quickInviteMember(inputStr: string) {
    if (!inputStr) return;
    
    const trip = this.selectedTrip();
    if (!trip) return;

    if (inputStr.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputStr)) {
        this.toastService.show('Invalid email format.', 'error');
        return;
      }

      if (trip.members.some(m => m.email === inputStr) || this.pendingNewMembers().some(m => m.email === inputStr)) {
        this.toastService.show('Member already in trip or pending.', 'error');
        return;
      }

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
      const newMember = { id: tempId, name: inputStr.split('@')[0], email: inputStr, isMe: false, avatar: undefined };
      this.pendingNewMembers.update(list => [...list, newMember]);
    } else {
      const ghostId = `ghost-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
      const ghostMember = { id: ghostId, name: inputStr, email: undefined, isMe: false, avatar: undefined };
      this.pendingNewMembers.update(list => [...list, ghostMember]);
    }
  }
  

  handleMemberRemove(id: string) {
    this.pendingNewMembers.update(list => list.filter(m => m.id !== id));
  }

  // ─── Submit ──────────────────────────────────────────────────────────
  async submit() {
    let tripId = this.selectedTripId();
    if (!tripId) { this.toastService.show('Please select a trip first.', 'error'); return; }
    
    if (this.photos().length === 0 && !this.caption && !this.isExpenseMode()) {
      this.toastService.show('Chưa có nội dung hoặc hình ảnh.', 'error'); return;
    }

    // Prepare pending members (only those included in splits)
    const activeMemberIds = this.expenseData ? Object.keys(this.expenseData.splits).filter(id => this.expenseData!.splits[id] > 0) : [];
    const pending = this.pendingNewMembers().filter(p => !this.isExpenseMode() || activeMemberIds.includes(p.id));
    const pendingWithEmail = pending.filter(p => p.email);
    if (pendingWithEmail.length > 0) {
      const emailListHtml = pendingWithEmail.map(p => `• <strong>${p.email}</strong>`).join('<br>');
      const msgHtml = `Có <b>${pendingWithEmail.length}</b> người mới vừa được thêm vào chưa nhận được thư mời:<br><br>${emailListHtml}<br><br>Bạn có muốn gửi lời mời cho họ tham gia trip này?`;
      
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

    this.isSubmitting.set(true);

    try {
      const res = await this.addMomentService.submitMoment({
        tripId,
        trip: this.selectedTrip(),
        photos: this.photos(),
        caption: this.caption,
        pendingNewMembers: pending,
        isExpenseMode: this.isExpenseMode(),
        expenseAmount: this.expenseData?.amount || 0,
        paidById: this.expenseData?.paidById || this.travelStore.currentUserId(),
        selectedCategory: this.expenseData?.category || 'FOOD',
        selectedLocation: this.selectedLocation,
        pendingReceipts: this.expenseData?.receipts || [],
        splits: this.expenseData?.splits || {}
      });

      this.pendingNewMembers.set([]);

      // Navigate appropriately based on whether it was an expense
      if (res.isAutoGeneratedTrip) {
        this.toastService.show(`✅ Đã lưu khoảnh khắc! Hệ thống vừa tự động tạo chuyến đi mới cho bạn.`, 'success');
        this.travelStore.refreshData(); // To cleanly bring in the new trip from DB
      }

      if (this.isExpenseMode() && this.expenseData && this.expenseData.amount > 0) {
        this.router.navigate(['/trip', res.finalTripId], { queryParams: { tab: 'EXPENSES' } });
      } else {
        this.router.navigate(['/trip', res.finalTripId], { queryParams: { tab: 'SOCIAL' } });
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Lỗi khi submit.', 'error');
    } finally {
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

  formatDate = formatDate;
  formatNumber = formatNumber;
}
