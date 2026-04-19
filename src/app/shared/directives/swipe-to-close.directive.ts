import { Directive, ElementRef, EventEmitter, HostListener, Output, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appSwipeToClose]',
  standalone: true
})
export class SwipeToCloseDirective {
  @Output() swipeClose = new EventEmitter<void>();

  private startY = 0;
  private currentY = 0;
  private isDragging = false;
  private threshold = 120; // 120px threshold to trigger close

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    
    // Check if the scroll area is at the top. If inner content is scrolled down, don't drag the modal.
    const target = event.target as HTMLElement;
    const scrollableElement = this.getClosestScrollable(target);
    
    // If we are touching a scrollable element and it's not at the top, don't initiate drag
    if (scrollableElement && scrollableElement.scrollTop > 0) {
      return;
    }

    this.startY = event.touches[0].clientY;
    this.isDragging = true;
    this.renderer.setStyle(this.el.nativeElement, 'transition', 'none');
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    
    this.currentY = event.touches[0].clientY;
    const deltaY = this.currentY - this.startY;

    // Only allow swiping down
    if (deltaY > 0) {
      // Apply transform with a bit of resistance
      this.renderer.setStyle(this.el.nativeElement, 'transform', `translateY(${deltaY}px)`);
    }
  }

  @HostListener('touchend')
  @HostListener('touchcancel')
  onTouchEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    
    this.renderer.setStyle(this.el.nativeElement, 'transition', 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)');

    const deltaY = this.currentY - this.startY;
    
    if (deltaY > this.threshold) {
      // Trigger close
      this.renderer.setStyle(this.el.nativeElement, 'transform', `translateY(100vh)`);
      setTimeout(() => {
        this.swipeClose.emit();
        // Reset transform for next time it opens
        setTimeout(() => {
          this.renderer.removeStyle(this.el.nativeElement, 'transform');
        }, 50);
      }, 300);
    } else {
      // Snap back
      this.renderer.removeStyle(this.el.nativeElement, 'transform');
    }
  }

  private getClosestScrollable(element: HTMLElement | null): HTMLElement | null {
    if (!element || element === this.el.nativeElement) return null;
    
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight;

    if (isScrollable) {
      return element;
    }

    return this.getClosestScrollable(element.parentElement);
  }
}
