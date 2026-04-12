import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div style="display:flex; flex-direction:column; min-height:100vh; background:#FAFAFA; padding:32px; justify-content:center; align-items:center;">
      <div style="width:100%; max-width:400px;">

        <!-- Header -->
        <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:40px;">
          <div style="width:64px; height:64px; background:#FFC800; border-radius:20px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; box-shadow:0 4px 12px rgba(255,200,0,0.3);">
            <span style="font-size:32px;">🏖️</span>
          </div>
          <h1 style="font-size:28px; font-weight:800; color:#1C1917; margin:0 0 8px 0; font-family:Inter,sans-serif;">
            {{ isLogin() ? 'Welcome Back' : 'Create Account' }}
          </h1>
          <p style="font-size:15px; color:#78716C; text-align:center; margin:0; font-family:Inter,sans-serif;">
            {{ isLogin() ? 'Sign in to access your travel diaries.' : 'Join WanderPool to plan your next adventure.' }}
          </p>
        </div>

        <!-- Form -->
        <form [formGroup]="authForm" (ngSubmit)="onSubmit()" style="display:flex; flex-direction:column; gap:16px;">

          <!-- Email -->
          <div style="display:flex; align-items:center; background:white; border-radius:16px; padding:14px 16px; border:1.5px solid #F0F0F0;">
            <svg style="flex-shrink:0; margin-right:12px;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            <input
              type="email"
              formControlName="email"
              placeholder="email@address.com"
              autocomplete="email"
              name="email"
              style="flex:1; font-size:16px; color:#1C1917; border:none; outline:none; background:transparent; font-family:Inter,sans-serif;"
            />
          </div>

          <!-- Password -->
          <div style="display:flex; align-items:center; background:white; border-radius:16px; padding:14px 16px; border:1.5px solid #F0F0F0;">
            <svg style="flex-shrink:0; margin-right:12px;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              type="password"
              formControlName="password"
              placeholder="Password"
              autocomplete="current-password"
              name="password"
              style="flex:1; font-size:16px; color:#1C1917; border:none; outline:none; background:transparent; font-family:Inter,sans-serif;"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            [disabled]="loading() || authForm.invalid"
            class="wp-submit-btn"
          >
            @if (loading()) {
              <div class="wp-spinner"></div>
            } @else {
              <span class="wp-btn-text">{{ isLogin() ? 'Sign In' : 'Sign Up' }}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1917" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            }
          </button>
        </form>

        <!-- Toggle Mode -->
        <button type="button" (click)="toggleMode()" class="wp-toggle-btn">
          <span class="wp-toggle-text">{{ isLogin() ? "Don't have an account?" : "Already have an account?" }}</span>
          <span class="wp-toggle-action">{{ isLogin() ? 'Sign Up' : 'Sign In' }}</span>
        </button>

        <!-- Divider -->
        <div style="display:flex; align-items:center; margin:28px 0;">
          <div style="flex:1; height:1px; background:#E5E5E5;"></div>
          <span style="margin:0 14px; font-size:11px; font-weight:600; color:#A8A29E; letter-spacing:0.1em; text-transform:uppercase; font-family:Inter,sans-serif;">Or continue with</span>
          <div style="flex:1; height:1px; background:#E5E5E5;"></div>
        </div>

        <!-- Google OAuth -->
        <button type="button" (click)="signInWithGoogle()" class="wp-google-btn">
          <svg style="width:20px; height:20px; margin-right:12px;" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span class="wp-google-text">Google</span>
        </button>

      </div>
    </div>
  `,
  styles: [`
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .wp-submit-btn {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      background: #FFC800 !important;
      color: #1C1917 !important;
      border: none;
      border-radius: 16px;
      padding: 18px;
      margin-top: 8px;
      font-weight: 700;
      font-size: 16px;
      font-family: Inter, sans-serif;
      box-shadow: 0 4px 16px rgba(255,200,0,0.35);
      cursor: pointer;
      width: 100%;
      transition: opacity 0.2s;
    }
    .wp-submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .wp-btn-text {
      color: #1C1917 !important;
      font-weight: 700 !important;
      font-size: 16px !important;
      margin-right: 8px;
    }
    .wp-spinner {
      width: 22px;
      height: 22px;
      border: 2.5px solid #1C1917;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .wp-toggle-btn {
      width: 100%;
      margin-top: 20px;
      padding: 10px;
      text-align: center;
      font-size: 14px;
      background: none;
      border: none;
      cursor: pointer;
      font-family: Inter, sans-serif;
    }
    .wp-toggle-text {
      color: #78716C !important;
    }
    .wp-toggle-action {
      font-weight: 700 !important;
      color: #1C1917 !important;
      margin-left: 4px;
    }
    .wp-google-btn {
      display: flex;
      flex-direction: row;
      width: 100%;
      justify-content: center;
      align-items: center;
      background: white;
      border: 1.5px solid #E5E5E5;
      border-radius: 16px;
      padding: 16px;
      color: #1C1917 !important;
      font-weight: 600;
      font-size: 16px;
      font-family: Inter, sans-serif;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .wp-google-text {
      color: #1C1917 !important;
    }
  `]
})
export class AuthComponent {
  private fb = inject(FormBuilder);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  isLogin = signal(true);
  loading = signal(false);

  authForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  toggleMode() {
    this.isLogin.update(v => !v);
  }

  async onSubmit() {
    if (this.authForm.invalid) return;
    this.loading.set(true);
    const { email, password } = this.authForm.value;
    try {
      if (this.isLogin()) {
        const { error } = await this.supabaseService.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        this.router.navigate(['/discover']);
      } else {
        const { data, error } = await this.supabaseService.client.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          alert('Please check your inbox for email verification!');
        } else {
          this.router.navigate(['/discover']);
        }
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      this.loading.set(false);
    }
  }

  async signInWithGoogle() {
    this.loading.set(true);
    try {
      const { error } = await this.supabaseService.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/auth/callback' }
      });
      if (error) throw error;
    } catch (error: any) {
      alert(error.message);
    } finally {
      this.loading.set(false);
    }
  }
}
