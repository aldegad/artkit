import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDX9NYghw_NPhGdOvaXvWgAcnKaFiR_X68",
  authDomain: "tools-b1c33.firebaseapp.com",
  projectId: "tools-b1c33",
  storageBucket: "tools-b1c33.firebasestorage.app",
  messagingSenderId: "935480961582",
  appId: "1:935480961582:web:54b6320d7a7d4c8e774dbf",
  measurementId: "G-ZTM97PPR76",
};

// Initialize Firebase (prevent multiple initializations)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
