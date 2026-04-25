import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

export interface MentionUser {
  id: string;
  name: string;
  avatar?: string;
}

@Component({
  selector: 'app-mention-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="mention-wrapper">
      <!-- MENTION POPOVER -->
      @if (showMentionPopover() && filteredCandidates().length > 0) {
        <div class="mention-popover">
          @for (user of filteredCandidates(); track user.id) {
            <div class="mention-item" (click)="selectMention(user)">
              <div class="avatar" [style.background]="!user.avatar ? getAvatarBg(user.name) : ''">
                @if (user.avatar) {
                  <img [src]="user.avatar" />
                } @else {
                  <span [style.color]="getAvatarColor(user.name)">{{ user.name.charAt(0).toUpperCase() }}</span>
                }
              </div>
              <span class="name">{{ user.name }}</span>
            </div>
          }
        </div>
      }

      <div class="input-container">
        <textarea
          #textarea
          class="comment-input"
          [placeholder]="placeholder | translate"
          [ngModel]="value"
          (ngModelChange)="onValueChange($event)"
          (keyup)="onKeyUp($event)"
          (click)="onInputClick()"
          rows="1"
          [disabled]="disabled"
          (keydown.enter)="$event.preventDefault(); onEnter()"
        ></textarea>
        
        <button class="btn-post" 
                [class.active]="value.trim().length > 0" 
                [disabled]="value.trim().length === 0 || disabled"
                (click)="onEnter()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" 
            [attr.stroke]="value.trim() ? '#FFC800' : '#E5E5E5'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./mention-input.component.scss']
})
export class MentionInputComponent {
  @Input() value: string = '';
  @Input() placeholder: string = 'comment.write';
  @Input() disabled: boolean = false;
  @Input() candidates: MentionUser[] = [];
  
  @Output() valueChange = new EventEmitter<string>();
  @Output() send = new EventEmitter<string>();

  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>;

  showMentionPopover = signal(false);
  mentionQuery = signal('');
  cursorPosition = 0;
  mentionStartIndex = -1;

  filteredCandidates = computed(() => {
    const query = this.mentionQuery().toLowerCase().trim();
    if (!query) return this.candidates.slice(0, 5); // Show first 5 by default if just @
    return this.candidates.filter(c => c.name.toLowerCase().includes(query)).slice(0, 5);
  });

  getAvatarBg(name: string): string {
    const colors = ['#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#F3E8FF', '#FFE4E6'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index] || colors[0];
  }

  getAvatarColor(name: string): string {
    const colors = ['#DC2626', '#D97706', '#059669', '#2563EB', '#9333EA', '#E11D48'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index] || colors[0];
  }

  onValueChange(val: string) {
    this.value = val;
    this.valueChange.emit(val);
    this.checkMentionTrigger();
    this.autoResize();
  }

  onKeyUp(event: KeyboardEvent) {
    this.checkMentionTrigger();
  }

  onInputClick() {
    this.checkMentionTrigger();
  }

  checkMentionTrigger() {
    const el = this.textareaRef?.nativeElement;
    if (!el) return;
    
    this.cursorPosition = el.selectionStart;
    const textBeforeCursor = this.value.substring(0, this.cursorPosition);
    
    // Match "@" preceded by space or start of string, followed by text without spaces
    const match = textBeforeCursor.match(/(?:^|\s)@([^\s]*)$/);
    
    if (match) {
      this.mentionStartIndex = this.cursorPosition - match[1].length - 1; // index of '@'
      this.mentionQuery.set(match[1]);
      this.showMentionPopover.set(true);
    } else {
      this.showMentionPopover.set(false);
    }
  }

  selectMention(user: MentionUser) {
    const before = this.value.substring(0, this.mentionStartIndex);
    const after = this.value.substring(this.cursorPosition);
    
    // Replace mention with @Name
    const mentionText = `@${user.name} `;
    const newVal = before + mentionText + after;
    
    this.onValueChange(newVal);
    this.showMentionPopover.set(false);
    
    // Set cursor position after the mention
    setTimeout(() => {
      const el = this.textareaRef.nativeElement;
      el.focus();
      const newPos = this.mentionStartIndex + mentionText.length;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  }

  onEnter() {
    if (this.value.trim().length > 0 && !this.disabled) {
      this.send.emit(this.value);
    }
  }

  // Close popover when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const targetElement = event.target as HTMLElement;
    if (targetElement && !targetElement.closest('.mention-wrapper')) {
      this.showMentionPopover.set(false);
    }
  }
  
  private autoResize() {
    const el = this.textareaRef?.nativeElement;
    if (el) {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight) + 'px';
    }
  }
}
