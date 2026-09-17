const admin = require('firebase-admin');

let firebaseApp = null;
let demoMode = false;

function initFirebase() {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || 
      FIREBASE_PRIVATE_KEY === '"-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY_HERE\\n-----END PRIVATE KEY-----\\n"') {
    console.warn('[Firebase] ⚠️  Admin SDK credentials not set — running in DEMO mode.');
    demoMode = true;
    return null;
  }

  try {
    if (admin.apps.length === 0) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      firebaseApp = admin.apps[0];
    }
    console.log('[Firebase] ✅ Admin SDK initialised.');
    return firebaseApp;
  } catch (err) {
    console.error('[Firebase] Init error — falling back to demo mode:', err.message);
    demoMode = true;
    return null;
  }
}

function isDemoMode() {
  return demoMode;
}

async function verifyIdToken(idToken) {
  if (demoMode) {
    // Demo mode: accept a special token format "demo:<uid>:<name>:<email>"
    if (idToken && idToken.startsWith('demo:')) {
      const parts = idToken.split(':');
      return {
        uid: parts[1] || 'demo-user-001',
        name: parts[2] ? decodeURIComponent(parts[2]) : 'Demo User',
        email: parts[3] ? decodeURIComponent(parts[3]) : 'demo@pujoplan.dev',
        picture: null,
      };
    }
    throw new Error('Invalid demo token');
  }

  const decoded = await admin.auth().verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    name: decoded.name || decoded.email?.split('@')[0] || 'User',
    email: decoded.email,
    picture: decoded.picture || null,
  };
}

module.exports = { initFirebase, isDemoMode, verifyIdToken };
