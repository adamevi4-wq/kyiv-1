import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';

export const configured = firebaseConfig.apiKey !== 'YOUR_API_KEY';

export const app = initializeApp(firebaseConfig);

// Offline persistence: keeps working (reads + queued writes) without a
// connection and syncs automatically the moment the browser is back online,
// and shares one cache across tabs of the same browser.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
