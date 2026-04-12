import { Component, inject, signal, computed, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { Trip } from '../../core/models/trip.model';

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './trips.component.html',
  styleUrl: './trips.component.scss'
})
export class TripsComponent implements OnInit {
  private router = inject(Router);
  private travelStore = inject(TravelStore);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly defaultCover = 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=1000';

  // ─── State ────────────────────────────────────────────────────────────────
  readonly trips = computed(() => this.travelStore.trips());
  readonly isLoading = signal(false);
  readonly modalOpen = signal(false);
  readonly step = signal<1 | 2>(1);
  readonly isCreating = signal(false);
  readonly emailError = signal('');

  // Form fields
  tripTitle = '';
  startDate = new Date().toISOString().split('T')[0];
  endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  emailInput = '';
  readonly members = signal<string[]>([]);
  readonly coverImagePreview = signal<string | null>(null);
  private coverImageFile: File | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    if (this.travelStore.trips().length === 0) {
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
      alert('Please enter a trip title!');
      return;
    }
    if (this.startDate > this.endDate) {
      alert('Start date must be before end date!');
      return;
    }
    this.step.set(2);
  }

  // ─── Image Handling ────────────────────────────────────────────────────────
  triggerImageInput() {
    this.fileInput.nativeElement.click();
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

      // Invite guests via Edge Function
      const guestMembers = await Promise.all(
        this.members().map(async (email) => {
          let userId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          try {
            const { data, error } = await db.functions.invoke('invite-member', { body: { email } });
            if (!error && data?.userId) userId = data.userId;
          } catch (err) {
            console.warn('invite-member failed for', email, err);
          }
          return { id: userId, name: email.split('@')[0], email, isMe: false };
        })
      );

      const { data, error } = await db.from('trips').insert({
        title: this.tripTitle || 'Untitled Trip',
        cover_image: finalCoverUrl,
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
      alert(err.message || 'Failed to create trip. Please try again.');
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
    this.startDate = new Date().toISOString().split('T')[0];
    this.endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    this.emailInput = '';
    this.members.set([]);
    this.coverImagePreview.set(null);
    this.coverImageFile = null;
    this.emailError.set('');
    this.step.set(1);
  }
}
