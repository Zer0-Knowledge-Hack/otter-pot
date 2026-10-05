import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
};

/** True solo si hay credenciales mínimas reales (sin clave → app UI sigue, sin login/sync). */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "undefined" &&
    firebaseConfig.apiKey.length >= 20 &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== "undefined",
);

function createFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

if (isFirebaseConfigured) {
  try {
    app = createFirebaseApp();
    auth = getAuth(app);
    db = getDatabase(app);
    storage = getStorage(app);

    if (typeof window !== "undefined" && firebaseConfig.measurementId) {
      try {
        analytics = getAnalytics(app);
      } catch {
        analytics = null;
      }
    }
  } catch (err) {
    console.warn(
      "otter-pot deshabilitado.",
      err,
    );
    app = null;
    auth = null;
    db = null;
    storage = null;
    analytics = null;
  }
} else if (typeof window !== "undefined") {
  console.info(
    "otter-pot no configurado ",
  );
}

export { app, auth, db, storage, analytics };
