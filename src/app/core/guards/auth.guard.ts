import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const { data: { session } } = await supabase.client.auth.getSession();
  if (session) return true;

  router.navigate(['/auth']);
  return false;
};

export const guestGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const { data: { session } } = await supabase.client.auth.getSession();
  if (!session) return true;

  router.navigate(['/discover']);
  return false;
};
