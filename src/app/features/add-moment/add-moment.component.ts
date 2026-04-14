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

@Component({
  selector: 'app-add-moment',
  standalone: true,
  imports: [FormsModule],
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
  readonly lockedShares = signal<Record<string, number | null>>({});
  readonly editingMemberId = signal<string | null>(null);
  
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
  readonly trips = computed(() => this.travelStore.trips());
  readonly selectedTrip = computed<Trip | null>(() => {
    const id = this.selectedTripId();
    return id ? (this.trips().find(t => t.id === id) ?? null) : null;
  });
  readonly currentTripMembers = computed(() => this.selectedTrip()?.members ?? []);

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    if (this.travelStore.trips().length === 0) {
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
    const ongoing = trips.find(t => t.startDate <= todayStr && t.endDate >= todayStr);
    if (ongoing) {
      this.selectedTripId.set(ongoing.id);
      this.setupIncludedMembers(ongoing.id);
    } else if (trips.length > 0) {
      const today = new Date();
      let closest = trips[0];
      let minDiff = Infinity;
      trips.forEach(t => {
        const diff = Math.abs(today.getTime() - new Date(t.startDate).getTime());
        if (diff < minDiff) { minDiff = diff; closest = t; }
      });
      this.selectedTripId.set(closest.id);
      this.setupIncludedMembers(closest.id);
    }
  }

  private setupIncludedMembers(tripId: string) {
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
      constraints.facingMode = this.facingMode();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false
      });
      
      // Update devices after granting permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.videoDevices = devices.filter(d => d.kind === 'videoinput');

      this.applyFlash();

      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.videoElement.nativeElement.play();
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable', err);
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
        });
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
    
    // Draw current frame with precise cropping
    if (this.facingMode() === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

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
      
      this.photos.update(p => [...p, { id, url, file, isDual: this.isDualMode() }]);
      // Do not stop camera, always go back to new photo
    }, 'image/webp', 0.9);
  }

  viewPhoto(id: string) {
    this.viewingPhotoId.set(id);
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
    Array.from(input.files).forEach(file => {
      const url = URL.createObjectURL(file);
      const id = Date.now().toString() + Math.random();
      this.photos.update(p => [...p, { id, url, file, isDual: false }]);
    });
    // Do not stop camera
    input.value = '';
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
       this.lockedShares.update(m => ({ ...m, [id]: null })); // reset lock if excluded
    }
  }

  startEdit(memberId: string) {
    this.editingMemberId.set(memberId);
  }

  setLockedAmount(memberId: string, value: string) {
    this.editingMemberId.set(null);
    const val = value.trim();
    if (!val) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
      return;
    }
    
    let num = 0;
    if (val.endsWith('%')) {
      const pct = parseFloat(val) / 100;
      num = (this.expenseAmount || 0) * pct;
    } else {
      // Allow for formatted values like 500,000
      num = parseFloat(val.replace(/[^0-9.]/g, ''));
    }
    
    if (isNaN(num)) {
      this.lockedShares.update(m => ({ ...m, [memberId]: null }));
    } else {
      this.lockedShares.update(m => ({ ...m, [memberId]: Math.round(num) }));
    }
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    
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
    if (remainder < 0) remainder = 0; 

    return floatCount > 0 ? Math.round(remainder / floatCount) : 0;
  }

  onInputSplitAmount(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      input.value = num.toLocaleString('en-US');
    } else {
      input.value = '';
    }
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
    const tripId = this.selectedTripId();
    if (!tripId) { this.toastService.show('Please select a trip first.', 'error'); return; }
    
    if (this.photos().length === 0 && !this.caption) {
      this.toastService.show('Chưa có nội dung hoặc hình ảnh.', 'error'); return;
    }

    this.isSubmitting.set(true);
    const db = this.supabase.client;
    const uid = this.travelStore.currentUserId();
    const trip = this.selectedTrip();

    try {
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

        const payload = {
          trip_id: tripId, description: this.caption || 'Untitled Expense', amount: this.expenseAmount,
          category: this.selectedCategory(), payer_id: this.paidById(),
          splits, receipt_urls: uploadedUrls
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
      if (this.isExpenseMode() && this.expenseAmount > 0) {
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'EXPENSES' } });
      } else {
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'SOCIAL' } });
      }
    } catch (err: any) {
      this.toastService.show(err.message || 'Lỗi khi upload.', 'error');
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
