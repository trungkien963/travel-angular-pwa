import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss'
})
export class AuthCallbackComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  async ngOnInit() {
    try {
      const { data, error } = await this.supabaseService.client.auth.getSession();
      if (error) throw error;

      if (data.session) {
        this.router.navigate(['/discover'], { replaceUrl: true });
      } else {
        // Try PKCE code exchange
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
