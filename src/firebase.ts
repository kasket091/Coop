import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase web config is public by design: access is controlled by Auth + firestore.rules, not by hiding this.
export const firebaseConfig = {
  apiKey: 'AIzaSyA5HVCmKv4mAkzz8g6sVw_LrwN83YFjVIk',
  authDomain: 'hilas-coop.firebaseapp.com',
  projectId: 'hilas-coop',
  storageBucket: 'hilas-coop.firebasestorage.app',
  messagingSenderId: '325711259247',
  appId: '1:325711259247:web:0d0fd6de16fb1093418f9a',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
