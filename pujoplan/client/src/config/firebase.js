import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  updateProfile,
  signOut
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const firebaseConfig = {
  apiKey: 'AIzaSyC150uGaRExVLzCYhA3W37kFzxsIHdWJ-0',
  authDomain: 'plucky-dryad-477507-s3.firebaseapp.com',
  projectId: 'plucky-dryad-477507-s3',
  storageBucket: 'plucky-dryad-477507-s3.firebasestorage.app',
  messagingSenderId: '889002640427',
  appId: '1:889002640427:android:ec4616a52b04c66819166e',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (Capacitor.isNativePlatform()) {
  try {
    GoogleAuth.initialize({
      clientId: '889002640427-e7f3pglblnddanrludbgb1u7g8000tsm.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
  } catch (err) {
    console.warn('[GoogleAuth] Native initialize warning:', err?.message);
  }
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    try {
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser.authentication?.idToken || googleUser.idToken;
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);

      const name =
        googleUser.name ||
        googleUser.displayName ||
        `${googleUser.givenName || ''} ${googleUser.familyName || ''}`.trim() ||
        result.user?.displayName ||
        (googleUser.email ? googleUser.email.split('@')[0] : 'Explorer');

      const photoURL = googleUser.imageUrl || googleUser.photoUrl || result.user?.photoURL || null;

      if (result.user) {
        await updateProfile(result.user, {
          displayName: name,
          photoURL: photoURL,
        }).catch(() => { });
      }

      if (name) localStorage.setItem('pp_google_name', name);
      if (photoURL) localStorage.setItem('pp_google_photo', photoURL);
      if (googleUser.email || result.user?.email) localStorage.setItem('pp_google_email', googleUser.email || result.user?.email);

      return result;
    } catch (error) {
      console.error('[GoogleNativeAuth] Error during native sign in:', error);
      throw error;
    }
  } else {
    const result = await signInWithPopup(auth, provider);
    const popupName = result.user?.displayName || (result.user?.email ? result.user.email.split('@')[0] : 'Explorer');
    if (popupName) localStorage.setItem('pp_google_name', popupName);
    if (result.user?.photoURL) localStorage.setItem('pp_google_photo', result.user.photoURL);
    if (result.user?.email) localStorage.setItem('pp_google_email', result.user.email);
    return result;
  }
}

export async function signOutUser() {
  if (Capacitor.isNativePlatform()) {
    await GoogleAuth.signOut().catch(() => { });
  }
  await signOut(auth);
}

export default app;
