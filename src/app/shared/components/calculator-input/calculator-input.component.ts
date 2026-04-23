import { Component, Input, Output, EventEmitter, ElementRef, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatNumber } from '../../../core/utils/format.util';

@Component({
  selector: 'app-calculator-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calculator-input.component.html',
  styleUrls: ['./calculator-input.component.scss']
})
export class CalculatorInputComponent {
  @Input() amount: number | null = null;
  @Output() amountChange = new EventEmitter<number | null>();
  @Output() commitBtn = new EventEmitter<number | null>(); // Emitted only on Done
  @Input() placeholder: string = '0';
  @Input() customClass: string = '';

  isKeyboardOpen = false;
  expression = ''; // The active string being typed
  suggestions: number[] = [];
  
  private el = inject(ElementRef);
  
  // Format number to VNĐ format (e.g. 100,000)
  formatNumber = formatNumber;

  // Handle clicking the input
  openKeyboard(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isKeyboardOpen = true;
    if (this.amount && !this.expression) {
      this.expression = this.amount.toString();
    }
    this.updateSuggestions();
    
    // Find the nearest scrollable container to add padding so we can scroll smoothly
    const scrollContainer = this.el.nativeElement.closest('.form-section') || 
                            this.el.nativeElement.closest('.modal') || 
                            this.el.nativeElement.closest('.details-sheet') || 
                            document.body;
    if (scrollContainer && scrollContainer !== document.body) {
      scrollContainer.style.paddingBottom = '500px';
      
      setTimeout(() => {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elRect = this.el.nativeElement.getBoundingClientRect();
        const relativeTop = elRect.top - containerRect.top;
        
        // Fixed keyboard height + suggestions + breathing room = ~480px from bottom.
        // We calculate the maximum safe Y coordinate for the input's top edge.
        const safeZoneBottomLimit = Math.max(60, containerRect.height - 480);
        
        if (relativeTop > safeZoneBottomLimit) {
          const neededScroll = relativeTop - safeZoneBottomLimit;
          scrollContainer.scrollBy({ top: neededScroll, behavior: 'smooth' });
        }
      }, 50);
    } else {
      setTimeout(() => {
        this.el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentClick(event: Event) {
    if (this.isKeyboardOpen && !this.el.nativeElement.contains(event.target)) {
      this.closeKeyboard();
    }
  }

  closeKeyboard() {
    this.isKeyboardOpen = false;
    const scrollContainer = this.el.nativeElement.closest('.form-section') || 
                            this.el.nativeElement.closest('.modal') || 
                            this.el.nativeElement.closest('.details-sheet') || 
                            document.body;
    if (scrollContainer) {
      scrollContainer.style.paddingBottom = '';
    }
    this.commitValue();
  }

  commitValue() {
    let finalVal = 0;
    if (this.expression.trim()) {
       finalVal = this.evaluateExpression(this.expression);
       finalVal = finalVal > 0 ? finalVal : 0;
    }
    this.amountChange.emit(finalVal);
    this.commitBtn.emit(finalVal);
    this.expression = ''; // Clear expression after commute
    this.suggestions = [];
  }

  // Handle keys from the custom keyboard
  onKeyPress(key: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    if (key === 'BACKSPACE') {
      this.expression = this.expression.slice(0, -1);
    } else if (key === '000') {
      // Don't add 000 if expression is empty
      if (this.expression.length > 0) {
        this.expression += '000';
      }
    } else if (['+', '-', 'x', '/'].includes(key)) {
      // replace x with *
      const op = key === 'x' ? '*' : key;
      // prevent multiple operators in a row
      const lastChar = this.expression.slice(-1);
      if (['+', '-', '*', '/'].includes(lastChar)) {
         this.expression = this.expression.slice(0, -1) + op;
      } else if (this.expression.length > 0) {
         this.expression += op;
      }
    } else {
      // prevent leading multiple zeros
      if (this.expression === '0') {
         this.expression = key;
      } else {
         this.expression += key;
      }
    }
    this.updateSuggestions();
    
    // Emit real time value so parent components update instantly
    if (!this.expression.trim()) {
      this.amountChange.emit(0);
    } else {
      const currentVal = this.evaluateExpression(this.expression);
      this.amountChange.emit(currentVal > 0 ? currentVal : 0);
    }
  }

  evaluateExpression(expr: string): number {
    if (!expr) return 0;
    try {
      // Remove all characters except numbers, +, -, *, /, .
      const safeExpr = expr.replace(/[^-()\d/*+.]/g, '');
      if (!safeExpr) return 0;
      
      // If trailing operator, remove it
      const lastChar = safeExpr.slice(-1);
      let evalExpr = safeExpr;
      if (['+', '-', '*', '/'].includes(lastChar)) {
         evalExpr = safeExpr.slice(0, -1);
      }
      
      const result = new Function('return ' + evalExpr)();
      return Math.round(result && !isNaN(result) && isFinite(result) && result > 0 ? result : 0);
    } catch {
      return 0; // Return 0 if syntax error
    }
  }

  updateSuggestions() {
    const currentVal = this.evaluateExpression(this.expression);
    if (currentVal > 0 && currentVal < 100000) {
      // Only suggest if the number is small enough
      this.suggestions = [currentVal * 1000, currentVal * 10000, currentVal * 100000];
    } else {
      this.suggestions = [];
    }
  }

  applySuggestion(val: number) {
    this.expression = val.toString();
    this.closeKeyboard();
  }

  get displayValue(): string {
    if (this.expression) {
      // Add thousand separators to numbers in the expression for better readability
      return this.expression.replace(/\d+/g, (match) => {
        return parseInt(match, 10).toLocaleString('en-US');
      }).replace(/\*/g, ' x ');
    }
    return '';
  }

  // Prevent background clicks
  stopPropagation(event: Event) {
    event.stopPropagation();
  }
}
