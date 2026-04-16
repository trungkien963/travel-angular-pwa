import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TravelStore } from '../../core/store/travel.store';
import { SupabaseService } from '../../core/services/supabase.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private travelStore = inject(TravelStore);
  translationService = inject(TranslationService);

  // ─── User info signals ────────────────────────────────────────────────────
  readonly displayName = signal('Nomad Explorer');
  readonly email = signal('');
  readonly avatarUrl = signal<string | null>(null);

  // ─── Real stats from store ────────────────────────────────────────────────
  readonly totalTrips = computed(() => this.travelStore.myTrips().length);
  readonly totalPosts = computed(() => this.travelStore.posts().length);
  readonly totalMembers = computed(() => {
    const uid = this.travelStore.currentUserId();
    const seen = new Set<string>();
    this.travelStore.myTrips().forEach(t => {
      t.members?.forEach(m => { if (m.id !== uid) seen.add(m.id); });
    });
    return seen.size;
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  async ngOnInit() {
    const { data } = await this.supabaseService.client.auth.getUser();
    const user = data?.user;
    if (user) {
      const meta = user.user_metadata;
      this.displayName.set(meta?.['full_name'] || meta?.['name'] || user.email?.split('@')[0] || 'Nomad Explorer');
      this.email.set(user.email || '');
      this.avatarUrl.set(meta?.['avatar_url'] || meta?.['picture'] || null);
    }

    if (this.travelStore.myTrips().length === 0) {
      await this.travelStore.initSupabase();
    }
  }

  // ─── Formatting ─────────────────────────────────────────────────────────────
  formatStat(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  onAvatarError() {
    this.avatarUrl.set(null);
  }

  async signOut() {
    try {
      // Clear push token (best-effort)
      const uid = this.travelStore.currentUserId();
      if (uid) {
        await this.supabaseService.client
          .from('users').update({ expo_push_token: null }).eq('id', uid);
      }
    } catch { /* ignore */ }

    await this.supabaseService.client.auth.signOut();
    this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
