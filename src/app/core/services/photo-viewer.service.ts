import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import PhotoSwipe from 'photoswipe';

@Injectable({
  providedIn: 'root'
})
export class PhotoViewerService {
  private lightbox: any;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  async open(images: string[], startIndex: number = 0) {
    if (!isPlatformBrowser(this.platformId)) return;

    // Destroy existing lightbox if any
    if (this.lightbox) {
      this.lightbox.destroy();
      this.lightbox = null;
    }

    // Pre-calculate dimensions
    const dataSource = await Promise.all(images.map(async src => {
      return new Promise<any>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ src, w: img.width, h: img.height, alt: 'Photo' });
        };
        img.onerror = () => {
          resolve({ src, w: 1080, h: 1080, alt: 'Photo' }); // fallback
        }
        img.src = src;
      });
    }));

    this.lightbox = new PhotoSwipeLightbox({
      dataSource: dataSource,
      pswpModule: PhotoSwipe,
      bgOpacity: 1, // 100% solid background
      zoom: false, // Hide redundant zoom button (pinch-to-zoom still works natively)
      counter: images.length > 1,
      arrowKeys: true,
      wheelToZoom: true,
      bgClickAction: 'close', // Close when clicking strictly on background
      clickToCloseNonZoomable: false, // Don't close when clicking image
      tapAction: (point: any, event: any) => {
        const target = event.target as HTMLElement;
        // If they click on anything that is not the image or a button, close it.
        if (target && target.tagName !== 'IMG' && !target.closest('button') && !target.closest('.pswp__top-bar')) {
          if (this.lightbox && this.lightbox.pswp) {
            this.lightbox.pswp.close();
          }
        } else {
          // If they click the image, toggle UI controls
          if (this.lightbox && this.lightbox.pswp) {
            this.lightbox.pswp.element?.classList.toggle('pswp__ui--idle');
          }
        }
      },
      imageClickAction: 'zoom', // standard zoom action
    });

    // Add Save Button
    this.lightbox.on('uiRegister', () => {
      this.lightbox.pswp.ui.registerElement({
        name: 'custom-download',
        order: 9,
        isButton: true,
        appendTo: 'bar', // use bar to ensure it renders, then CSS will position it fixed/absolute
        html: `
          <button class="pswp-bottom-download-btn" aria-label="Download">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        `,
        onInit: (el: any, pswp: any) => {
          const btn = el.querySelector('.pswp-bottom-download-btn') || el;
          
          btn.addEventListener('click', async (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            
            const src = pswp.currSlide?.data?.src;
            if (!src) return;

            if (navigator.share) {
              try {
                const response = await fetch(src);
                const blob = await response.blob();
                const file = new File([blob], 'wanderpool-photo.jpg', { type: blob.type || 'image/jpeg' });
                
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({
                    files: [file],
                    title: 'WanderPool Photo',
                  });
                } else {
                  await navigator.share({
                    title: 'WanderPool Photo',
                    url: src
                  });
                }
              } catch (err) {
                console.error('Error sharing', err);
                const link = document.createElement('a');
                link.href = src;
                link.download = 'wanderpool-photo.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            } else {
              const link = document.createElement('a');
              link.href = src;
              link.download = 'wanderpool-photo.jpg';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          });
        }
      });
    });

    this.lightbox.init();
    this.lightbox.loadAndOpen(startIndex);
  }
}
