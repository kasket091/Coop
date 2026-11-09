import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Read from .env (not committed; copy .env.example). Vite still builds these into the public app: access is
// controlled by Auth + firestore.rules and by restricting the key to this site in Google Cloud.
const env = import.meta.env
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) throw new Error(`Firebase config missing (${missing.join(', ')}). Copy .env.example to .env and fill it in.`)

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// The phone keeps the last loaded records, so the app shows them at once and live figures replace them within a
// second. Saving still needs a connection (store.ts refuses writes offline). Cleared when someone logs out.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
