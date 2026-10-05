import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User,
  type Auth,
  type AuthError,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase.config";
import { ensureUserProfile } from "./realtime";
import { isValidWalletAddress, shortAddress } from "./walletLink";
import { activeNetwork } from "~~/contracts/config";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("profile");
googleProvider.addScope("email");

export const TG_SESSION_KEY = "otterpot.telegram";
/** Sesión invitado (explorar /app sin Firebase ni wallet). */
export const GUEST_SESSION_KEY = "otterpot.guest";

export function enableGuestSession() {
  try {
    localStorage.setItem(GUEST_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearGuestSession() {
  try {
    localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasGuestSession(): boolean {
  try {
    return localStorage.getItem(GUEST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export class AuthRequiredError extends Error {
  code = "AUTH_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

const FIREBASE_MISSING =
  "otter-pot no está configurado.";

function requireAuth(): Auth {
  if (!auth || !isFirebaseConfigured) {
    throw new Error(FIREBASE_MISSING);
  }
  return auth;
}

function mapAuthError(err: unknown): string {
  const code = (err as AuthError)?.code || "";
  const map: Record<string, string> = {
    "auth/unauthorized-domain":
      "Este dominio no está autorizado en otter-pot. Ve a Console → Authentication → Settings → Authorized domains y agrega localhost (y tu dominio de producción).",
    "auth/popup-blocked":
      "El navegador bloqueó el popup de Google. Permite popups para este sitio o usa el flujo por redirección.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google. Intenta de nuevo.",
    "auth/cancelled-popup-request": "Se canceló el popup. Intenta de nuevo.",
    "auth/operation-not-allowed":
      "Google Sign-In no está activo. Actívalo en otter-pot → Authentication → Sign-in method → Google.",
    "auth/admin-restricted-operation":
      "Anonymous Auth está desactivado en otter-pot. Actívalo en Sign-in method → Anonymous, o inicia sesión con Google.",
    "auth/network-request-failed": "Sin conexión. Revisa tu red e intenta otra vez.",
    "auth/account-exists-with-different-credential":
      "Ese correo ya está vinculado con otro método de acceso.",
    "auth/invalid-api-key": FIREBASE_MISSING,
  };
  if (map[code]) return map[code];
  if (err instanceof Error && err.message) return err.message;
  return "No se pudo iniciar sesión.";
}

export async function loginWithGoogle(): Promise<User | null> {
  const a = requireAuth();
  try {
    const credential = await signInWithPopup(a, googleProvider);
    await ensureUserProfile(credential.user, {
      username: credential.user.displayName || credential.user.email?.split("@")[0] || "Otter",
    });
    return credential.user;
  } catch (err) {
    const code = (err as AuthError)?.code;
    if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(a, googleProvider);
      return null;
    }
    throw new Error(mapAuthError(err));
  }
}

export async function completeGoogleRedirect(): Promise<User | null> {
  if (!auth || !isFirebaseConfigured) return null;
  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    await ensureUserProfile(result.user, {
      username: result.user.displayName || result.user.email?.split("@")[0] || "Otter",
    });
    return result.user;
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const a = requireAuth();
  const credential = await signInWithEmailAndPassword(a, email, password);
  await ensureUserProfile(credential.user);
  return credential.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  username: string,
): Promise<User> {
  const a = requireAuth();
  const credential = await createUserWithEmailAndPassword(a, email, password);
  await updateProfile(credential.user, { displayName: username });
  await ensureUserProfile(credential.user, { username });
  return credential.user;
}

/**
 * Vincula wallet a sesión Firebase.
 * Prefiere usuario Google/email existente; si no hay, intenta Anonymous.
 * Si Firebase o Anonymous no están disponibles, retorna null (no rompe la app).
 */
export async function loginWithWallet(address: string): Promise<User | null> {
  if (!auth || !isFirebaseConfigured) return null;
  if (!isValidWalletAddress(address)) {
    console.warn("loginWithWallet: address inválida", address);
    return null;
  }

  let user = auth.currentUser;
  if (!user) {
    try {
      const credential = await signInAnonymously(auth);
      user = credential.user;
    } catch (err) {
      console.warn("Anonymous Auth no disponible:", mapAuthError(err));
      return null;
    }
  }
  // Nota: isConnected ≠ autenticación fuerte. Preparado para SIWE (walletLink.ts).
  await ensureUserProfile(user, {
    username: user.displayName || shortAddress(address),
    walletAddress: address,
    walletChainId: activeNetwork.chainId,
  });
  return user;
}

/**
 * Resuelve uid Firebase para escribir retos.
 * Orden: sesión actual → Anonymous+wallet → error claro (usar Google).
 */
export async function resolveOwnerForWrite(address?: string): Promise<User> {
  const a = requireAuth();

  if (a.currentUser) {
    if (address) {
      await ensureUserProfile(a.currentUser, {
        walletAddress: address,
        username:
          a.currentUser.displayName || `${address.slice(0, 6)}…${address.slice(-4)}`,
      });
    }
    return a.currentUser;
  }

  if (address) {
    const user = await loginWithWallet(address);
    if (user) return user;
  }

  throw new AuthRequiredError(
    "Para guardar en F necesitas sesión. Inicia con Google (recomendado) o activa Authentication → Anonymous en F Console.",
  );
}

export async function ensureFirebaseSession(): Promise<User | null> {
  if (!auth || !isFirebaseConfigured) return null;
  if (auth.currentUser) return auth.currentUser;
  try {
    const credential = await signInAnonymously(auth);
    await ensureUserProfile(credential.user);
    return credential.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    localStorage.removeItem(TG_SESSION_KEY);
    localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    // ignore
  }
  if (!auth) return;
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  if (!auth || !isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export { auth, isFirebaseConfigured };
