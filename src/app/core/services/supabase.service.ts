import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _currentUser = new BehaviorSubject<User | null>(null);
  public currentUser$ = this._currentUser.asObservable();
  private _session = new BehaviorSubject<Session | null>(null);
  public session$ = this._session.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        // Persist session in localStorage (default) and auto-refresh
        persistSession: true,
        autoRefreshToken: true,
        // Detect auth from URL hash for OAuth callbacks
        detectSessionInUrl: true,
      }
    });

    // Silently initialize session - suppress console noise from Supabase internals
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this._session.next(session);
      this._currentUser.next(session?.user ?? null);
    }).catch(() => {
      // No session available - this is expected for first-time users
      this._session.next(null);
      this._currentUser.next(null);
    });

    // Listen for ALL auth state changes (login, logout, token refresh, OAuth callback)
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.next(session);
      this._currentUser.next(session?.user ?? null);
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }
}

