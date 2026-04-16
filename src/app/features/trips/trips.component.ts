import { Component, inject, signal, computed, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { ToastService } from '../../core/services/toast.service';
import { Trip } from '../../core/models/trip.model';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './trips.component.html',
  styleUrl: './trips.component.scss'
})
export class TripsComponent implements OnInit {
  private router = inject(Router);
  private travelStore = inject(TravelStore);
  private toastService = inject(ToastService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly defaultCover = 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=1000';

  // ─── State ────────────────────────────────────────────────────────────────
  readonly trips = computed(() => this.travelStore.myTrips());
  readonly isLoading = signal(false);
  readonly modalOpen = signal(false);
  readonly step = signal<1 | 2>(1);
  readonly isCreating = signal(false);
  readonly emailError = signal('');

  // Form fields
  tripTitle = '';
  tripLocation = '';
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  emailInput = '';
  readonly members = signal<string[]>([]);
  readonly coverImagePreview = signal<string | null>(null);
  private coverImageFile: File | null = null;
  readonly locationSuggestions = signal<any[]>([]);
  readonly isLocationLoading = signal(false);
  private locationTimeout: any;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    if (this.travelStore.myTrips().length === 0) {
      this.isLoading.set(true);
      await this.travelStore.initSupabase();
      this.isLoading.set(false);
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  goToTrip(id: string) {
    this.router.navigate(['/trip', id]);
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  openModal() {
    this.resetForm();
    this.modalOpen.set(true);
  }

  closeModal() {
    this.modalOpen.set(false);
  }

  setStep(s: 1 | 2) {
    this.step.set(s);
  }

  goToStep2() {
    if (!this.tripTitle.trim()) {
      this.toastService.show('Please enter a trip title!', 'error');
      return;
    }
    if (this.startDate > this.endDate) {
      this.toastService.show('Start date must be before end date!', 'error');
      return;
    }
    this.step.set(2);
  }

  // ─── Input Handling ────────────────────────────────────────────────────────
  triggerImageInput() {
    this.fileInput.nativeElement.click();
  }

  openDatePicker(event: Event, inputEl: HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
      } else {
        inputEl.click();
      }
    } catch (e) {
      console.warn('Native date picker not supported or cannot be opened programmatically.', e);
    }
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.coverImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.coverImagePreview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  // ─── Location Search ────────────────────────────────────────────────────────
  onLocationChange(query: string) {
    clearTimeout(this.locationTimeout);
    if (!query || query.trim().length < 2) {
      this.locationSuggestions.set([]);
      this.isLocationLoading.set(false);
      return;
    }
    
    this.isLocationLoading.set(true);
    this.locationTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        this.locationSuggestions.set(data);
      } catch (err) {
        console.error('Failed to fetch locations', err);
        this.locationSuggestions.set([]);
      } finally {
        this.isLocationLoading.set(false);
      }
    }, 400); // 400ms debounce
  }

  selectLocation(loc: any) {
    this.tripLocation = loc.display_name;
    this.locationSuggestions.set([]);
  }

  // ─── Members ──────────────────────────────────────────────────────────────
  addMember() {
    this.emailError.set('');
    const email = this.emailInput.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.emailError.set('Invalid email format.');
      return;
    }
    if (this.members().includes(email)) {
      this.emailError.set('Email already added.');
      return;
    }

    this.members.update(list => [email, ...list]);
    this.emailInput = '';
  }

  removeMember(email: string) {
    this.members.update(list => list.filter(e => e !== email));
  }

  // ─── Create Trip ──────────────────────────────────────────────────────────
  async createTrip() {
    this.isCreating.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const db = this.travelStore['supabase'].client;

      // Upload cover image if selected
      let finalCoverUrl = this.defaultCover;
      if (this.coverImageFile) {
        try {
          const ext = this.coverImageFile.name.split('.').pop();
          const path = `covers/${Date.now()}.${ext}`;
          const { data, error } = await db.storage
            .from('nomadsync-media')
            .upload(path, this.coverImageFile, { contentType: this.coverImageFile.type });
          if (!error && data) {
            const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
            finalCoverUrl = urlData.publicUrl;
          }
        } catch {
          console.warn('Cover upload failed, using default');
        }
      }

      const { data: authData } = await db.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) throw new Error('Not authenticated');

      const ownerMember = {
        id: authUser.id,
        name: authUser.user_metadata?.['full_name'] || authUser.email?.split('@')[0] || 'Me',
        email: authUser.email,
        isMe: true,
        avatar: authUser.user_metadata?.['avatar_url'] || null
      };

      const guestMembers = await Promise.all(
        this.members().map(async (email) => {
          let userId: string | null = null;
          let userName = email.split('@')[0];
          let userAvatar: string | undefined = undefined;
          
          try {
            const { data, error } = await db.functions.invoke('invite-member', { body: { email } });
            if (!error && data?.userId) {
              userId = data.userId;
              try {
                const { data: userData } = await db.from('users').select('full_name, avatar_url').eq('id', userId).maybeSingle();
                if (userData?.['full_name']) userName = userData['full_name'];
                if (userData?.['avatar_url']) userAvatar = userData['avatar_url'];
              } catch(e) {}
            }
          } catch (err) {
            console.warn('invite-member failed for', email, err);
          }
          
          if (!userId) userId = crypto.randomUUID();
          
          return { id: userId, name: userName, email, isMe: false, avatar: userAvatar };
        })
      );

      const { data, error } = await db.from('trips').insert({
        title: this.tripTitle || 'Untitled Trip',
        cover_image: finalCoverUrl,
        location_name: this.tripLocation || null,
        location_city: this.tripLocation || null,
        start_date: this.startDate,
        end_date: this.endDate,
        owner_id: authUser.id,
        members: [ownerMember, ...guestMembers],
        is_private: true
      }).select().single();

      if (error) throw error;

      const newTrip: Trip = {
        id: data['id'],
        title: data['title'],
        coverImage: data['cover_image'],
        locationName: data['location_name'],
        locationCity: data['location_city'],
        startDate: data['start_date'],
        endDate: data['end_date'],
        ownerId: data['owner_id'],
        members: typeof data['members'] === 'string' ? JSON.parse(data['members']) : (data['members'] || []),
        isPrivate: data['is_private']
      };

      this.travelStore.addTrip(newTrip);
      this.closeModal();
      this.router.navigate(['/trip', newTrip.id]);
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to create trip. Please try again.', 'error');
    } finally {
      this.isCreating.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  isUpcoming(startDate: string): boolean {
    return new Date(startDate) > new Date();
  }

  private resetForm() {
    this.tripTitle = '';
    this.tripLocation = '';
    this.startDate = new Date().toISOString().split('T')[0];
    this.endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    this.emailInput = '';
    this.members.set([]);
    this.coverImagePreview.set(null);
    this.coverImageFile = null;
    this.locationSuggestions.set([]);
    this.isLocationLoading.set(false);
    this.emailError.set('');
    this.step.set(1);
  }
}
