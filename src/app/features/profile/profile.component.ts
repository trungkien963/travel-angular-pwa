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
  avatarError = false;
  editAvatarError = false;

  // ─── Edit State ─────────────────────────────────────────────────────────────
  readonly isEditing = signal(false);
  readonly editName = signal('');
  readonly editAvatar = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly isSaving = signal(false);

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
  openEditModal() {
    this.editName.set(this.displayName());
    this.editAvatar.set(this.avatarUrl() || '');
    this.selectedFile.set(null);
    this.avatarError = false;
    this.editAvatarError = false;
    this.isEditing.set(true);
  }

  closeEditModal() {
    this.isEditing.set(false);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.selectedFile.set(file);
      // Create local preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editAvatar.set(e.target?.result as string);
        this.editAvatarError = false;
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile() {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const newName = this.editName().trim();
      let newAvatar = this.editAvatar().trim();
      const uid = this.travelStore.currentUserId();
      if (!uid) return;

      if (this.selectedFile()) {
        const file = this.selectedFile()!;
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `avatars/${uid}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await this.supabaseService.client.storage.from('nomadsync-media').upload(path, file, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = this.supabaseService.client.storage.from('nomadsync-media').getPublicUrl(path);
          newAvatar = urlData.publicUrl;
        } else {
          console.error('Avatar upload failed', uploadErr);
        }
      }

      // Update in auth metadata (so it persists across sessions without querying users table)
      await this.supabaseService.client.auth.updateUser({
        data: { full_name: newName, avatar_url: newAvatar || null }
      });

      // Update in public.users
      await this.supabaseService.client.from('users').update({
        full_name: newName,
        avatar_url: newAvatar || null
      }).eq('id', uid);

      // Update local state
      this.displayName.set(newName || 'Nomad Explorer');
      this.avatarUrl.set(newAvatar || null);
      this.avatarError = false;
      
      // Update store so it reflects across the app immediately
      this.travelStore.refreshData();
      
      this.closeEditModal();
    } catch (err) {
      console.error('Failed to update profile', err);
    } finally {
      this.isSaving.set(false);
    }
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
