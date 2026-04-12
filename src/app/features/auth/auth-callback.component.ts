import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

/**
 * This component handles the OAuth callback from Supabase.
 * After Google OAuth, Supabase redirects to /auth/callback with
 * access_token & refresh_token in the URL hash or query params.
 * The Supabase JS client picks this up automatically via getSession().
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div style="display:flex; min-height:100vh; align-items:center; justify-content:center; background:#FAFAFA;">
      <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
        <div style="width:64px; height:64px; background:#FFC800; border-radius:20px; display:flex; align-items:center; justify-content:center;">
          <span style="font-size:32px;">🏖️</span>
        </div>
        <div style="width:32px; height:32px; border:3px solid #FFC800; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <p style="color:#78716C; font-family:Inter,sans-serif; font-size:15px;">Signing you in...</p>
      </div>
    </div>
  `,
  styles: [`@keyframes spin { to { transform: rotate(360deg); } }`]
})
export class AuthCallbackComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  async ngOnInit() {
    // Supabase JS v2 automatically reads the hash fragment (#access_token=...) 
    // or code from the URL when getSession() is called.
    // We just need to wait for the session to be established.
    try {
      const { data, error } = await this.supabaseService.client.auth.getSession();
      if (error) throw error;
      if (data.session) {
        this.router.navigate(['/discover'], { replaceUrl: true });
      } else {
        // Try exchanging code for session (PKCE flow)
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
          const { error: exchangeError } = await this.supabaseService.client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
        this.router.navigate(['/discover'], { replaceUrl: true });
      }
    } catch (err) {
      console.error('Auth callback failed:', err);
      this.router.navigate(['/auth'], { replaceUrl: true });
    }
  }
}
