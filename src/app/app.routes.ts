import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'discover', pathMatch: 'full' },

  // Guest-only routes (redirect to /discover if already logged in)
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/auth-callback.component').then(m => m.AuthCallbackComponent)
  },

  // Protected routes (redirect to /auth if not logged in)
  {
    path: 'discover',
    canActivate: [authGuard],
    loadComponent: () => import('./features/discover/discover.component').then(m => m.DiscoverComponent)
  },
  {
    path: 'trips',
    canActivate: [authGuard],
    loadComponent: () => import('./features/trips/trips.component').then(m => m.TripsComponent)
  },
  {
    path: 'trip/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent)
  },

  // Fallback
  { path: '**', redirectTo: 'discover' }
];
