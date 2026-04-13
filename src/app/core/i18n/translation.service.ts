import { Injectable, signal, effect } from '@angular/core';
import { enDictionary } from './en.dictionary';
import { viDictionary } from './vi.dictionary';

export type Language = 'en' | 'vi';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly STORAGE_KEY = 'wanderpool_lang';
  
  // App starts with English by default if no preference is saved
  readonly currentLang = signal<Language>('en');

  constructor() {
    this.initLang();
  }

  private initLang() {
    const saved = localStorage.getItem(this.STORAGE_KEY) as Language;
    if (saved === 'en' || saved === 'vi') {
      this.currentLang.set(saved);
    } else {
      // Basic detection
      const browserLang = navigator.language.slice(0, 2);
      if (browserLang === 'vi') {
        this.currentLang.set('vi');
      }
    }
  }

  setLang(lang: Language) {
    this.currentLang.set(lang);
    localStorage.setItem(this.STORAGE_KEY, lang);
  }

  toggleLang() {
    this.setLang(this.currentLang() === 'en' ? 'vi' : 'en');
  }

  // Synchronous string translater (useful for components)
  translate(key: string): string {
    const dict = this.currentLang() === 'vi' ? viDictionary : enDictionary;
    // @ts-ignore
    return dict[key] || key;
  }
}
