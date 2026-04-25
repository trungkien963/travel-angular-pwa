import { Component, inject, signal, output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationService, LocationResult } from '../../../../core/services/location.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-location-search',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  styles: [`
    .input-card {
      background: #FFFFFF;
      border-radius: 24px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .field-label {
      font-size: 10px;
      font-weight: 800;
      color: #A8A29E;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin: 0 0 10px;
    }
  `],
  template: `
    <div class="input-card">
      <p class="field-label" style="margin-bottom: 12px;">{{ 'action.addLocation' | translate }}</p>
      @if (selectedLocation) {
        <div class="location-selected" style="background: #FFFFFF; border: 1px solid #F0F0F0; border-radius: 24px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="loc-icon" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 200, 0, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFC800" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div>
              <p class="location-name" style="margin: 0; font-weight: 800; font-size: 15px; color: #1C1917;">{{ selectedLocation.name }}</p>
              <p class="location-city" style="margin: 2px 0 0; font-size: 12px; font-weight: 600; color: #A8A29E;">{{ selectedLocation.address }}</p>
            </div>
          </div>
          <button class="btn-clear-location" (click)="clearLocation()" style="background: transparent; border: none; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #A8A29E; transition: color 0.2s;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      } @else {
        <div class="location-search-row" style="display: flex; align-items: center; gap: 12px; background: #FFFFFF; border: 1px solid #F0F0F0; border-radius: 24px; padding: 2px 18px; transition: border-color 0.2s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input type="text" class="location-input" style="flex: 1; border: none; background: transparent; padding: 14px 0; font-size: 15px; font-weight: 600; color: #1C1917; outline: none; font-family: inherit;" [placeholder]="'moment.searchLocation' | translate" [(ngModel)]="locationQuery" (input)="onLocationSearch()" id="input-location" />
        </div>
        
        @if (isSearching()) {
          <p class="searching-text" style="font-size: 13px; color: #a1a1aa; margin: 12px 0 0; text-align: center;">{{ 'action.searching' | translate }}</p>
        }
        
        @if (locationResults().length > 0) {
          <div class="location-results" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
            @for (result of locationResults(); track result.placeId) {
              <button class="location-result-item" (click)="selectLocation(result)" style="background: #FFFFFF; border: 1px solid #F0F0F0; border-radius: 20px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; transition: all 0.2s;">
                <div class="loc-icon" style="width: 36px; height: 36px; border-radius: 50%; background: #F9FAFB; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <p class="loc-result-name" style="margin: 0; font-weight: 800; font-size: 15px; color: #1C1917;">{{ result.name }}</p>
                  <p class="loc-result-addr" style="margin: 2px 0 0; font-size: 12px; font-weight: 600; color: #A8A29E;">{{ result.address }}</p>
                </div>
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
