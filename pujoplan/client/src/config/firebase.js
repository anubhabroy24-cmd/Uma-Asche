import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCDPD4Pqf5LLbQoVE01a-k36xTUtalrhx4',
  authDomain: 'plucky-dryad-477507-s3.firebaseapp.com',
  projectId: 'plucky-dryad-477507-s3',
  storageBucket: 'plucky-dryad-477507-s3.appspot.com',
  messagingSenderId: '889002640427',
  appId: '1:889002640427:web:e56af7097f30f05419166e',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result;
}

export async function signOutUser() {
  await signOut(auth);
}

export default app;
