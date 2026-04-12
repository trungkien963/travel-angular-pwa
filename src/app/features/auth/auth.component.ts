import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
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
