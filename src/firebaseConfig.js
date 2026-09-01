// ---------------------------------------------------------------------------
// Firebase config — PASTE YOUR OWN VALUES HERE.
//
// Get them for free at https://console.firebase.google.com :
//   1. Create a project (no credit card needed, "Spark" free plan).
//   2. Project settings (gear icon) → General → "Your apps" → Add app → Web (</>).
//   3. Copy the firebaseConfig object it gives you and paste the values below.
//
// This object is NOT a secret. It is meant to ship inside the public
// JS bundle — every Firebase web app exposes it. Real security comes from
// the Firestore security rules in `firestore.rules`, not from hiding this
// file. See README.md for details.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
