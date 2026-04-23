import { Injectable } from '@angular/core';

export interface LocationResult {
  placeId: string;
  name: string;
  city: string;
  address: string;
  raw?: any;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  async searchLocations(query: string): Promise<LocationResult[]> {
    if (!query || query.trim().length < 2) return [];
    
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5`, {
        headers: { 'Accept-Language': 'en' }
      });
      const data: any[] = await res.json();
      return data.map(d => ({
        placeId: d.place_id?.toString(),
        name: d.display_name?.split(',')[0]?.trim() || '',
        city: d.display_name?.split(',').slice(1, 3).join(',').trim() || '',
        address: d.display_name || '',
        raw: d
      }));
    } catch (error) {
      console.error('Failed to fetch locations', error);
      return [];
    }
  }
}
