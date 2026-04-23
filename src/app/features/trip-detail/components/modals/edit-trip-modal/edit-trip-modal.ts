import { Component, Input, Output, EventEmitter, inject, signal, OnInit, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Trip } from '../../../../../core/models/trip.model';

@Component({
  selector: 'app-edit-trip-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeToCloseDirective],
  templateUrl: './edit-trip-modal.html',
  styleUrl: './edit-trip-modal.css'
})
export class EditTripModalComponent implements OnInit {
  @Input({ required: true }) trip!: Trip;
  @Output() onClose = new EventEmitter<void>();
  @Output() onCoverUpload = new EventEmitter<void>(); // Trigger isCoverLoading on parent

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  editTripTitle = '';
  editTripLocation = '';
  editTripStartDate = '';
  editTripEndDate = '';
  editTripCoverPreviewUrl: string | null = null;
  editTripCoverFile: File | null = null;
  
  readonly editLocationSuggestions = signal<any[]>([]);
  readonly isEditLocationLoading = signal(false);
  private editLocationTimeout: any;
  readonly isSavingTrip = signal(false);
  
  @ViewChild('editFileInput') editFileInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    this.editTripTitle = this.trip.title || '';
    this.editTripLocation = this.trip.locationName || '';
    this.editTripStartDate = this.trip.startDate ? new Date(this.trip.startDate).toISOString().split('T')[0] : '';
    this.editTripEndDate = this.trip.endDate ? new Date(this.trip.endDate).toISOString().split('T')[0] : '';
    this.editTripCoverPreviewUrl = this.trip.coverImage || null;
    this.editTripCoverFile = null;
  }

  closeEditTrip() {
    this.onClose.emit();
  }

  triggerEditImageInput() {
    if (this.editFileInput?.nativeElement) {
      this.editFileInput.nativeElement.click();
    }
  }

  onEditImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editTripCoverFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.ngZone.run(() => {
        this.editTripCoverPreviewUrl = e.target?.result as string;
        this.cdr.detectChanges();
      });
    };
    reader.readAsDataURL(file);
  }

  onEditLocationChange(query: string) {
    clearTimeout(this.editLocationTimeout);
    if (!query || query.trim().length < 2) {
      this.editLocationSuggestions.set([]);
      this.isEditLocationLoading.set(false);
      return;
    }
    
    this.isEditLocationLoading.set(true);
    this.editLocationTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        this.editLocationSuggestions.set(data);
      } catch (err) {
        console.error('Failed to fetch locations', err);
        this.editLocationSuggestions.set([]);
      } finally {
        this.isEditLocationLoading.set(false);
      }
    }, 400);
  }

  selectEditLocation(loc: any) {
    this.editTripLocation = loc.display_name;
    this.editLocationSuggestions.set([]);
  }

  openEditDatePicker(event: Event, inputEl: HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (typeof (inputEl as any).showPicker === 'function') {
        (inputEl as any).showPicker();
      } else {
        inputEl.click();
      }
    } catch (e) {
      console.warn('Native date picker not supported or cannot be opened programmatically.', e);
    }
  }

  async saveEditTrip() {
    if (!this.editTripTitle.trim()) {
      this.toastService.show('Please enter a trip title!', 'error');
      return;
    }
    if (this.editTripStartDate > this.editTripEndDate) {
      this.toastService.show('Start date must be before end date!', 'error');
      return;
    }
    
    const t = this.trip;
    
    this.isSavingTrip.set(true);
    this.travelStore.setGlobalLoading(true);

    try {
      const db = this.supabaseService.client;
      let finalCoverUrl = t.coverImage;

      if (this.editTripCoverFile) {
        try {
          const ext = this.editTripCoverFile.name.split('.').pop();
          const path = `covers/${Date.now()}.${ext}`;
          const { data, error } = await db.storage
            .from('nomadsync-media')
            .upload(path, this.editTripCoverFile, { contentType: this.editTripCoverFile.type });
            
          if (!error && data) {
            const { data: urlData } = db.storage.from('nomadsync-media').getPublicUrl(path);
            finalCoverUrl = urlData.publicUrl;
            
            // Delete old cover if it's from our storage bucket
            if (t.coverImage && t.coverImage.includes('/nomadsync-media/')) {
               const oldPath = t.coverImage.split('/nomadsync-media/')[1];
               if (oldPath) {
                 await db.storage.from('nomadsync-media').remove([oldPath]);
               }
            }
          }
        } catch (e) {
          console.warn('Cover upload failed', e);
        }
      }

      const updateData = {
        title: this.editTripTitle,
        cover_image: finalCoverUrl,
        location_name: this.editTripLocation || null,
        location_city: this.editTripLocation || null,
        start_date: this.editTripStartDate,
        end_date: this.editTripEndDate,
      };

      const { error } = await db.from('trips').update(updateData).eq('id', t.id);
      if (error) throw error;

      this.ngZone.run(() => {
        this.travelStore.updateTrip(t.id, {
          title: this.editTripTitle,
          coverImage: finalCoverUrl,
          locationName: this.editTripLocation || undefined,
          locationCity: this.editTripLocation || undefined,
          startDate: this.editTripStartDate,
          endDate: this.editTripEndDate
        });
        
        this.toastService.show('Trip updated successfully!', 'success');
        this.closeEditTrip();
        if (this.editTripCoverFile) {
          this.onCoverUpload.emit();
        }
      });
    } catch (err: any) {
      this.ngZone.run(() => {
        this.toastService.show(err.message || 'Failed to update trip.', 'error');
      });
    } finally {
      this.ngZone.run(() => {
        this.isSavingTrip.set(false);
        this.travelStore.setGlobalLoading(false);
      });
    }
  }
}
