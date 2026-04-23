import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Root: guests see landing, logged-in users redirect to moments
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent)
  },

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

  // Full-screen protected routes (NO shell / bottom nav)
  {
    path: 'add-moment',
    canActivate: [authGuard],
    loadComponent: () => import('./features/add-moment/add-moment.component').then(m => m.AddMomentComponent)
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
        // Post Detail Page
        path: 'post/:id',
        loadComponent: () => import('./features/post-detail/post-detail.component').then(m => m.PostDetailComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent)
      },
      { path: '', redirectTo: 'discover', pathMatch: 'full' }
    ]
  },

  // Fallback
  { path: '**', redirectTo: 'discover' }
];

