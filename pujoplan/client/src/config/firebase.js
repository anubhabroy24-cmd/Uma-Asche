import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut
} from 'firebase/auth';
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

if (Capacitor.isNativePlatform()) {
  GoogleAuth.initialize({
    clientId: '889002640427-e7f3pglblnddanrludbgb1u7g8000tsm.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    grantOfflineAccess: true,
  });
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
      return result;
    } catch (error) {
      console.error('[GoogleNativeAuth] Error during native sign in:', error);
      throw error;
    }
  } else {
    const result = await signInWithPopup(auth, provider);
    return result;
  }
}

export async function signOutUser() {
  if (Capacitor.isNativePlatform()) {
    await GoogleAuth.signOut().catch(() => {});
  }
  await signOut(auth);
}

export default app;
