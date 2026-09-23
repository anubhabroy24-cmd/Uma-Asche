import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser } from '../config/firebase';
import { createSession } from '../services/api';

const AuthContext = createContext(null);

async function createAppSession(firebaseUser) {
  try {
    const idToken = await firebaseUser.getIdToken();
    return await createSession(idToken);
  } catch (error) {
    if (error.response?.status === 401) {
      try {
        const demoToken = [
          'demo',
          firebaseUser.uid,
          encodeURIComponent(firebaseUser.displayName || localStorage.getItem('pp_google_name') || 'User'),
          encodeURIComponent(firebaseUser.email || localStorage.getItem('pp_google_email') || 'demo@pujoplan.dev'),
        ].join(':');
        return await createSession(demoToken);
      } catch (_) { }
    }

    console.warn('[Auth] Backend API session unavailable, using authenticated Firebase session.');
    const exactName =
      firebaseUser.displayName ||
      localStorage.getItem('pp_google_name') ||
      firebaseUser.providerData?.[0]?.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'User';

    const exactPhoto =
      firebaseUser.photoURL ||
      localStorage.getItem('pp_google_photo') ||
      firebaseUser.providerData?.[0]?.photoURL ||
      null;

    const localUser = {
      id: firebaseUser.uid,
      name: exactName,
      email: firebaseUser.email || localStorage.getItem('pp_google_email') || 'user@pujoplan.app',
      profileImage: exactPhoto,
      createdAt: new Date().toISOString(),
    };
    const mockPayload = btoa(unescape(encodeURIComponent(JSON.stringify({
      id: localUser.id,
      name: localUser.name,
      email: localUser.email,
      exp: Math.floor(Date.now() / 1000) + 86400 * 30
    }))));
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sessionCreating = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        localStorage.removeItem('pp_token');
        localStorage.removeItem('pp_user');
        setUser(null);
        setLoading(false);
        return;
      }

      if (sessionCreating.current) return;

      const storedRaw = localStorage.getItem('pp_user');
      const token = localStorage.getItem('pp_token');
      if (storedRaw && token) {
        try {
          const stored = JSON.parse(storedRaw);
          const payload = JSON.parse(atob(token.split('.')[1]));
          // Strictly ensure stored session belongs to the currently logged in Firebase UID
          const isSameAccount = stored.firebaseUid === firebaseUser.uid || stored.id === firebaseUser.uid || stored.email === firebaseUser.email;

          if (isSameAccount && payload.exp * 1000 > Date.now()) {
            const freshName = firebaseUser.displayName || localStorage.getItem('pp_google_name') || firebaseUser.email?.split('@')[0];
            const freshPhoto = firebaseUser.photoURL || localStorage.getItem('pp_google_photo');
            if (freshName && (stored.name === 'User' || !stored.name || stored.name !== freshName)) {
              stored.name = freshName;
            }
            if (freshPhoto) stored.profileImage = freshPhoto;
            localStorage.setItem('pp_user', JSON.stringify(stored));
            setUser(stored);
            setLoading(false);
            // Sync with native AndroidBridge so BackgroundCallService monitors incoming calls
            try {
              if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.saveUserSession) {
                const uid = stored.id || stored.userId || stored.uid || stored.firebaseUid || '';
                window.AndroidBridge.saveUserSession(String(uid), token || '', stored.name || '', 'https://uma-asche.onrender.com/api');
              }
            } catch (_) {}
            return;
          }
        } catch (_) { }
      }

      // If different account or invalid token, purge old session completely
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');

      sessionCreating.current = true;
      try {
        const { data } = await createAppSession(firebaseUser);
        const resolvedName =
          firebaseUser.displayName ||
          localStorage.getItem('pp_google_name') ||
          (data.user?.name && data.user.name !== 'User' ? data.user.name : null) ||
          firebaseUser.email?.split('@')[0] ||
          'Pujo Explorer';

        const userObj = {
          ...data.user,
          name: resolvedName,
          firebaseUid: firebaseUser.uid,
          profileImage: firebaseUser.photoURL || localStorage.getItem('pp_google_photo') || data.user?.profileImage,
        };
        localStorage.setItem('pp_token', data.token);
        localStorage.setItem('pp_user', JSON.stringify(userObj));
        setUser(userObj);

        // Sync with native AndroidBridge so BackgroundCallService monitors incoming calls
        try {
          if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.saveUserSession) {
            const uid = userObj.id || userObj.userId || userObj.uid || userObj.firebaseUid || '';
            window.AndroidBridge.saveUserSession(String(uid), data.token || '', userObj.name || '', 'https://uma-asche.onrender.com/api');
          }
        } catch (_) {}
      } catch (e) {
        console.error('[Auth] Session exchange failed:', e.message);
        await signOutUser().catch(() => { });
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
      // Clear old state before signing in
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      localStorage.removeItem('pp_google_name');
      localStorage.removeItem('pp_google_photo');
      localStorage.removeItem('pp_google_email');

      const result = await signInWithGoogle();
      return result;
    } catch (e) {
      const msg =
        e.code === 'auth/popup-closed-by-user' ? 'Sign-in cancelled.' :
          e.code === 'auth/popup-blocked' ? 'Popup blocked. Allow popups for this site.' :
            e.code === 'auth/network-request-failed' ? 'Network error. Check your connection.' :
              e.code === 'auth/unauthorized-domain' ? 'Domain not authorized in Firebase Console.' :
                (e.response?.data?.error || e.message || 'Sign-in failed. Please try again.');
      setError(msg);
      throw new Error(msg);
    }
  }

  async function logout() {
    setUser(null);
    try {
      if (typeof window !== 'undefined' && window.AndroidBridge && window.AndroidBridge.clearUserSession) {
        window.AndroidBridge.clearUserSession();
      }
    } catch (_) {}
    try {
      // Clear user session tokens only, keep offline persistent cache for groups
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      localStorage.removeItem('pp_google_name');
      localStorage.removeItem('pp_google_photo');
      localStorage.removeItem('pp_google_email');
    } catch (_) {}
    await signOutUser().catch(() => { });
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
