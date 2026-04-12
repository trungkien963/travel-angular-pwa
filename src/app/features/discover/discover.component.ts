import { Component } from '@angular/core';

@Component({
  selector: 'app-discover',
  standalone: true,
  template: `
    <div class="flex flex-col min-h-screen bg-[#FAFAFA] p-8 items-center justify-center">
      <h1 class="text-3xl font-extrabold text-[#1C1917] mb-4">Discover Page</h1>
      <p class="text-[15px] text-[#78716C] text-center">
        This is a placeholder for the Discover feed.
      </p>
    </div>
  `
})
export class DiscoverComponent {}
