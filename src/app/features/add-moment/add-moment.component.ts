import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TravelStore } from '../../core/store/travel.store';
import { SupabaseService } from '../../core/services/supabase.service';
import { Trip } from '../../core/models/trip.model';
import { Expense } from '../../core/models/expense.model';
import { Post } from '../../core/models/social.model';

interface LocationResult {
  placeId: string;
  name: string;
  city: string;
  address: string;
}

@Component({
  selector: 'app-add-moment',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './add-moment.component.html',
  styleUrl: './add-moment.component.scss'
})
export class AddMomentComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private travelStore = inject(TravelStore);
  private supabase = inject(SupabaseService);

  // ─── Image state ─────────────────────────────────────────────────────────
  readonly previewUrl = signal<string | null>(null);
  readonly previewUrl2 = signal<string | null>(null);
  readonly isDual = signal(false);
  private capturedFiles: File[] = [];

  // ─── Form state ──────────────────────────────────────────────────────────
  caption = '';
  expenseAmount = 0;
  showTripPicker = false;
  readonly isExpenseMode = signal(false);
  readonly isSubmitting = signal(false);
  readonly selectedTripId = signal<string | null>(null);
  readonly paidById = signal('');
  readonly includedMembers = signal<Record<string, boolean>>({});

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

  readonly currentTripMembers = computed(() => {
    return this.selectedTrip()?.members ?? [];
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    if (this.travelStore.trips().length === 0) {
      await this.travelStore.initSupabase();
    }

    // Auto-select trip from query param OR find today's active trip
    const paramTripId = this.route.snapshot.queryParamMap.get('tripId');
    if (paramTripId) {
      this.selectedTripId.set(paramTripId);
    } else {
      this.autoSelectTrip();
    }

    this.paidById.set(this.travelStore.currentUserId());
  }

  private autoSelectTrip() {
    const todayStr = new Date().toISOString().split('T')[0];
    const trips = this.trips();
    const ongoing = trips.find(t => t.startDate <= todayStr && t.endDate >= todayStr);
    if (ongoing) {
      this.selectedTripId.set(ongoing.id);
    } else if (trips.length > 0) {
      const today = new Date();
      let closest = trips[0];
      let minDiff = Infinity;
      trips.forEach(t => {
        const diff = Math.abs(today.getTime() - new Date(t.startDate).getTime());
        if (diff < minDiff) { minDiff = diff; closest = t; }
      });
      this.selectedTripId.set(closest.id);
    }
  }

  // ─── Trip selector ────────────────────────────────────────────────────────
  selectTrip(id: string) {
    this.selectedTripId.set(id);
    this.showTripPicker = false;
    // Reinitialize included members for this trip
    const members = this.trips().find(t => t.id === id)?.members ?? [];
    const included: Record<string, boolean> = {};
    members.forEach(m => included[m.id] = true);
    this.includedMembers.set(included);
    if (!this.paidById()) this.paidById.set(this.travelStore.currentUserId());
  }

  // ─── Expense mode ─────────────────────────────────────────────────────────
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
  }

  calcShare(memberId: string): number {
    if (!this.includedMembers()[memberId]) return 0;
    const total = this.expenseAmount || 0;
    const count = Object.values(this.includedMembers()).filter(Boolean).length;
    return count > 0 ? Math.round(total / count) : 0;
  }

  // ─── Image handling ───────────────────────────────────────────────────────
  onCameraCapture(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.capturedFiles = [file];
    this.previewUrl.set(URL.createObjectURL(file));
    this.previewUrl2.set(null);
    this.isDual.set(false);
    input.value = '';
  }

  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;

    this.capturedFiles = files.slice(0, 5); // max 5
    this.previewUrl.set(URL.createObjectURL(files[0]));
    if (files.length >= 2) {
      this.previewUrl2.set(URL.createObjectURL(files[1]));
      this.isDual.set(true);
    } else {
      this.isDual.set(false);
    }
    input.value = '';
  }

  retake() {
    this.previewUrl.set(null);
    this.previewUrl2.set(null);
    this.isDual.set(false);
    this.capturedFiles = [];
  }

  // ─── Location search (Nominatim OSM) ─────────────────────────────────────
  onLocationSearch() {
    if (this.locationTimer) clearTimeout(this.locationTimer);
    const q = this.locationQuery.trim();
    if (q.length < 2) { this.locationResults.set([]); return; }

    this.locationTimer = setTimeout(async () => {
      this.isSearching.set(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data: any[] = await res.json();
        this.locationResults.set(data.map(d => ({
          placeId: d.place_id.toString(),
          name: d.display_name.split(',')[0].trim(),
          city: d.display_name.split(',').slice(1, 3).join(',').trim(),
          address: d.display_name
        })));
      } catch {
        this.locationResults.set([]);
      } finally {
        this.isSearching.set(false);
      }
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

  // ─── Submit ───────────────────────────────────────────────────────────────
  async submit() {
    const tripId = this.selectedTripId();
    if (!tripId) { alert('Please select a trip first.'); return; }

    this.isSubmitting.set(true);
    const db = this.supabase.client;
    const uid = this.travelStore.currentUserId();
    const trip = this.selectedTrip();

    try {
      // Upload images if present
      const uploadedUrls: string[] = [];
      for (const file of this.capturedFiles) {
        const path = `posts/${uid}/${Date.now()}_${file.name}`;
        const { data } = await db.storage.from('nomadsync-media').upload(path, file, { upsert: true });
        if (data) {
          const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
          uploadedUrls.push(urlData.publicUrl);
        }
      }

      if (this.isExpenseMode() && this.expenseAmount > 0) {
        // Save as Expense
        const splits: Record<string, number> = {};
        this.currentTripMembers().forEach(m => {
          splits[m.id] = this.calcShare(m.id);
        });

        const payload = {
          trip_id: tripId,
          desc: this.caption || 'Untitled Expense',
          amount: this.expenseAmount,
          category: 'OTHER',
          payer_id: this.paidById(),
          date: new Date().toISOString().split('T')[0],
          splits,
          receipt_urls: uploadedUrls
        };
        const { data } = await db.from('expenses').insert(payload).select().single();
        if (data) {
          this.travelStore.upsertExpense({
            id: data['id'], tripId: data['trip_id'],
            desc: data['desc'], amount: data['amount'],
            category: data['category'], payerId: data['payer_id'],
            date: data['date'], splits: data['splits']
          } as Expense);
        }
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'EXPENSES' } });
      } else {
        // Save as Post
        if (!this.caption && uploadedUrls.length === 0) {
          alert('Add a photo or write something!');
          this.isSubmitting.set(false);
          return;
        }

        const member = trip?.members.find(m => m.id === uid);
        const authorName = this.travelStore.currentUserProfile()?.name || member?.name || 'Traveler';

        const payload = {
          trip_id: tripId,
          user_id: uid,
          content: this.caption,
          image_urls: uploadedUrls,
          is_dual_camera: this.isDual(),
          location_name: this.selectedLocation?.name ?? null,
          location_city: this.selectedLocation?.city ?? null,
          likes: [],
          comments: []
        };
        const { data } = await db.from('posts').insert(payload).select().single();
        if (data) {
          this.travelStore.addPost({
            id: data['id'], tripId: data['trip_id'],
            authorId: uid, authorName,
            content: data['content'],
            images: data['image_urls'] ?? [],
            isDual: data['is_dual_camera'],
            timestamp: data['created_at'],
            date: data['created_at']?.split('T')[0],
            likes: 0, hasLiked: false, comments: []
          } as Post);
        }
        this.router.navigate(['/trip', tripId], { queryParams: { tab: 'SOCIAL' } });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save. Please try again.');
      this.isSubmitting.set(false);
    }
  }

  // ─── Close ────────────────────────────────────────────────────────────────
  handleClose() {
    if (this.previewUrl() || this.caption) {
      if (!confirm('Discard your edits?')) return;
    }
    history.length > 1 ? history.back() : this.router.navigate(['/discover']);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatNumber(val: number): string { return val.toLocaleString('en-US'); }
}
