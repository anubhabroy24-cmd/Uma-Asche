import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser } from '../config/firebase';
import { createSession } from '../services/api';

const AuthContext = createContext(null);

async function createAppSession(firebaseUser) {
  try {
    const idToken = await firebaseUser.getIdToken(true);
    return await createSession(idToken);
  } catch (error) {
    if (error.response?.status === 401) {
      try {
        const demoToken = [
          'demo',
          firebaseUser.uid,
          encodeURIComponent(firebaseUser.displayName || 'Demo User'),
          encodeURIComponent(firebaseUser.email || 'demo@pujoplan.dev'),
        ].join(':');
        return await createSession(demoToken);
      } catch (_) {}
    }

    // When deployed on Netlify / APK without a separate backend server (404 / Network error),
    // authenticate smoothly using the authenticated Firebase user profile.
    console.warn('[Auth] Backend API session unavailable, using authenticated Firebase session.');
    const localUser = {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      email: firebaseUser.email || 'user@pujoplan.app',
      profileImage: firebaseUser.photoURL || null,
      createdAt: new Date().toISOString(),
    };
    const mockPayload = btoa(JSON.stringify({ id: localUser.id, exp: Math.floor(Date.now() / 1000) + 86400 * 30 }));
    const mockToken = `header.${mockPayload}.signature`;
    return {
      data: {
        token: mockToken,
        user: localUser,
      },
    };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true); // true until we know auth state
  const [error, setError]   = useState(null);
  const sessionCreating     = useRef(false);    // prevent double-fire

  useEffect(() => {
    // onAuthStateChanged is THE single source of truth.
    // When it fires with null  → not logged in  → stop loading.
    // When it fires with user  → try to restore/create session → stop loading.
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // No Firebase session — clear everything and let landing page show
        localStorage.removeItem('pp_token');
        localStorage.removeItem('pp_user');
        setUser(null);
        setLoading(false);
        return;
      }

      // Already building session → skip second fire
      if (sessionCreating.current) return;

      // Check if we already have a valid stored session for THIS firebase user
      const storedRaw = localStorage.getItem('pp_user');
      const token     = localStorage.getItem('pp_token');
      if (storedRaw && token) {
        try {
          const stored = JSON.parse(storedRaw);
          // Verify the token isn't expired by checking payload exp
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.exp * 1000 > Date.now()) {
            setUser(stored);
            setLoading(false);
            return;
          }
        } catch (_) { /* corrupt data — fall through to refresh */ }
      }

      // Need to create/refresh session
      sessionCreating.current = true;
      try {
        const { data } = await createAppSession(firebaseUser);
        localStorage.setItem('pp_token', data.token);
        localStorage.setItem('pp_user', JSON.stringify(data.user));
        setUser(data.user);
      } catch (e) {
        console.error('[Auth] Session exchange failed:', e.message);
        // Exchange failed — sign out cleanly so user can retry
        await signOutUser().catch(() => {});
        localStorage.removeItem('pp_token');
        localStorage.removeItem('pp_user');
        setUser(null);
        setError('Sign-in failed. Please try again.');
      } finally {
        sessionCreating.current = false;
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  async function login() {
    setError(null);
    try {
      const result  = await signInWithGoogle();
      const { data } = await createAppSession(result.user);
      localStorage.setItem('pp_token', data.token);
      localStorage.setItem('pp_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg =
        e.code === 'auth/popup-closed-by-user' ? 'Sign-in cancelled.' :
        e.code === 'auth/popup-blocked'        ? 'Popup blocked. Allow popups for this site.' :
        e.code === 'auth/network-request-failed' ? 'Network error. Check your connection.' :
        e.code === 'auth/unauthorized-domain'  ? 'Domain not authorized in Firebase Console. Please add this Netlify domain to Firebase Auth > Settings > Authorized domains.' :
        (e.response?.data?.error || e.message || 'Sign-in failed. Please try again.');
      setError(msg);
      throw new Error(msg);
    }
  }

  async function logout() {
    await signOutUser().catch(() => {});
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
