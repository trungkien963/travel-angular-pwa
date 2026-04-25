import { Directive, Output, EventEmitter, HostListener, HostBinding } from '@angular/core';

@Directive({
  selector: '[appLongPress]',
  standalone: true
})
export class LongPressDirective {
  @Output() longPress = new EventEmitter<MouseEvent | TouchEvent>();
  
  private timeoutId: any;

  // Ngăn chặn trình duyệt hiển thị menu "Lưu ảnh" hoặc "Copy" mặc định
  @HostBinding('style.-webkit-touch-callout') touchCallout = 'none';
  @HostBinding('style.user-select') userSelect = 'none';

  @HostListener('touchstart', ['$event'])
  @HostListener('mousedown', ['$event'])
  onPressDown(event: MouseEvent | TouchEvent) {
    this.timeoutId = setTimeout(() => {
      // Haptic Feedback (rung nhẹ) nếu trình duyệt hỗ trợ
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      this.longPress.emit(event);
    }, 500); // Ngưỡng 0.5 giây là chuẩn cho Long Press
  }

  @HostListener('touchend')
  @HostListener('mouseup')
  @HostListener('mouseleave')
  onPressUp() {
    clearTimeout(this.timeoutId);
  }

  // Ngăn chặn menu chuột phải trên PC hoặc menu ngữ cảnh của một số trình duyệt
  @HostListener('contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault();
  }
}
