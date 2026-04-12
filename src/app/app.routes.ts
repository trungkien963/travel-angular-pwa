import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'discover', pathMatch: 'full' },

  // Guest-only routes
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/auth-callback.component').then(m => m.AuthCallbackComponent)
  },

  // Protected routes - wrapped in Shell layout (bottom nav)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'discover',
        loadComponent: () => import('./features/discover/discover.component').then(m => m.DiscoverComponent)
      },
      {
        path: 'trips',
        loadComponent: () => import('./features/trips/trips.component').then(m => m.TripsComponent)
      },
      {
        path: 'trip/:id',
        loadComponent: () => import('./features/trip-detail/trip-detail.component').then(m => m.TripDetailComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent)
      },
    ]
  },

  // Fallback
  { path: '**', redirectTo: 'discover' }
];
