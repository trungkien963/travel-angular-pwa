import { Component, inject, signal, output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationService, LocationResult } from '../../../../core/services/location.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-location-search',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="input-card">
      <p class="field-label" style="margin-bottom: 12px;">{{ 'action.addLocation' | translate }}</p>
      @if (selectedLocation) {
        <div class="location-selected" style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <p class="location-name" style="margin: 0; font-weight: 600; font-size: 15px; color: #1e3a8a;">{{ selectedLocation.name }}</p>
            <p class="location-city" style="margin: 4px 0 0; font-size: 13px; color: #60a5fa;">{{ selectedLocation.address }}</p>
          </div>
          <button class="btn-clear-location" (click)="clearLocation()" style="background: white; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #ef4444; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      } @else {
        <div class="location-search-row" style="display: flex; align-items: center; gap: 12px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 12px; padding: 0 16px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input type="text" class="location-input" style="flex: 1; border: none; background: transparent; padding: 14px 0; font-size: 15px; color: #333; outline: none;" placeholder="Search on OpenStreetMap..." [(ngModel)]="locationQuery" (input)="onLocationSearch()" id="input-location" />
        </div>
        
        @if (isSearching()) {
          <p class="searching-text" style="font-size: 13px; color: #a1a1aa; margin: 12px 0 0; text-align: center;">{{ 'action.searching' | translate }}</p>
        }
        
        @if (locationResults().length > 0) {
          <div class="location-results" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
            @for (result of locationResults(); track result.placeId) {
              <button class="location-result-item" (click)="selectLocation(result)" style="background: white; border: 1px solid #f0f0f0; border-radius: 10px; padding: 12px; text-align: left; cursor: pointer; transition: all 0.2s;">
                <p class="loc-result-name" style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #333;">{{ result.name }}</p>
                <p class="loc-result-addr" style="margin: 0; font-size: 12px; color: #888;">{{ result.address }}</p>
              </button>
            }
          </div>
        }
      }
    </div>
  `
})
export class LocationSearchComponent {
  private locationService = inject(LocationService);

  @Input() selectedLocation: LocationResult | null = null;
  onLocationChange = output<LocationResult | null>();

  locationQuery = '';
  readonly isSearching = signal(false);
  readonly locationResults = signal<LocationResult[]>([]);
  private locationTimer: ReturnType<typeof setTimeout> | null = null;

  onLocationSearch() {
    if (this.locationTimer) clearTimeout(this.locationTimer);
    const q = this.locationQuery.trim();
    if (q.length < 2) { 
      this.locationResults.set([]); 
      return; 
    }
    
    this.isSearching.set(true);
    this.locationTimer = setTimeout(async () => {
      const results = await this.locationService.searchLocations(q);
      this.locationResults.set(results);
      this.isSearching.set(false);
    }, 400);
  }

  selectLocation(r: LocationResult) {
    this.selectedLocation = r;
    this.locationQuery = '';
    this.locationResults.set([]);
    this.onLocationChange.emit(r);
  }

  clearLocation() {
    this.selectedLocation = null;
    this.locationQuery = '';
    this.onLocationChange.emit(null);
  }
}
