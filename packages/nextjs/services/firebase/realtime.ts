import { ref, set, get, update, onValue, type Database, type Unsubscribe } from "firebase/database";
import type { User } from "firebase/auth";
import { db, isFirebaseConfigured } from "./firebase.config";

function requireDb(): Database {
  if (!db || !isFirebaseConfigured) {
    throw new Error(
      "otter-pot no está configurado. ",
    );
  }
  return db;
}

export type UserProfile = {
  uid: string;
  username: string;
  displayName?: string;
  email: string;
  avatar: string;
  photoURL?: string;
  walletAddress: string;
  /** Wallet pendiente de verificación SIWE (no sobrescribe walletAddress hasta firmar). */
  pendingWalletAddress?: string;
  walletChainId?: number;
  provider?: "google" | "email" | "anonymous" | "wallet" | string;
  createdAt: number;
  updatedAt?: number;
  level: number;
  points: number;
  streak?: number;
  telegramConnected: boolean;
  telegramId?: number;
  telegramUsername?: string;
  telegramSyncedAt?: number;
  bio?: string;
  notifyTelegram?: boolean;
  notifyEmail?: boolean;
  profilePublic?: boolean;
};

export type LeaderboardEntry = {
  userId: string;
  username?: string;
  avatar?: string;
  points: number;
  wins: number;
  rewards: number;
  updatedAt?: number;
};

function userRef(uid: string) {
  return ref(requireDb(), `users/${uid}`);
}

function inferProvider(user: User): string {
  const ids = user.providerData?.map(p => p.providerId) || [];
  if (ids.includes("google.com")) return "google";
  if (ids.includes("password")) return "email";
  if (user.isAnonymous) return "anonymous";
  return ids[0] || "unknown";
}

export async function ensureUserProfile(
  user: User,
  extras?: Partial<
    Pick<UserProfile, "username" | "walletAddress" | "walletChainId" | "pendingWalletAddress">
  >,
): Promise<UserProfile> {
  const snap = await get(userRef(user.uid));
  const now = Date.now();

  if (snap.exists()) {
    const existing = snap.val() as UserProfile;
    const patch: Partial<UserProfile> = { updatedAt: now };

    // No sobrescribir wallet silenciosamente si ya hay otra distinta → pending
    if (extras?.walletAddress) {
      const next = extras.walletAddress.toLowerCase();
      const current = (existing.walletAddress || "").toLowerCase();
      if (!current) {
        patch.walletAddress = extras.walletAddress;
        if (extras.walletChainId) patch.walletChainId = extras.walletChainId;
      } else if (next !== current) {
        patch.pendingWalletAddress = extras.walletAddress;
        if (extras.walletChainId) patch.walletChainId = extras.walletChainId;
      } else if (extras.walletChainId && extras.walletChainId !== existing.walletChainId) {
        patch.walletChainId = extras.walletChainId;
      }
    }

    const nextUsername =
      extras?.username || user.displayName || user.email?.split("@")[0] || "";
    if (
      nextUsername &&
      (!existing.username ||
        existing.username === "Otter" ||
        existing.username.includes("…") ||
        (extras?.username && extras.username !== existing.username))
    ) {
      patch.username = nextUsername;
    }

    if (user.displayName && user.displayName !== existing.displayName) {
      patch.displayName = user.displayName;
    }
    if (user.email && user.email !== existing.email) {
      patch.email = user.email;
    }
    if (user.photoURL && user.photoURL !== existing.avatar) {
      patch.avatar = user.photoURL;
      patch.photoURL = user.photoURL;
    }
    const provider = inferProvider(user);
    if (provider && provider !== existing.provider) {
      patch.provider = provider;
    }

    // Solo updatedAt no vale la pena
    if (Object.keys(patch).length > 1) {
      await update(userRef(user.uid), patch);
      return { ...existing, ...patch };
    }
    return existing;
  }

  const profile: UserProfile = {
    uid: user.uid,
    username: extras?.username || user.displayName || user.email?.split("@")[0] || "Otter",
    displayName: user.displayName || "",
    email: user.email || "",
    avatar: user.photoURL || "",
    photoURL: user.photoURL || "",
    walletAddress: extras?.walletAddress || "",
    walletChainId: extras?.walletChainId,
    provider: inferProvider(user),
    createdAt: now,
    updatedAt: now,
    level: 1,
    points: 0,
    streak: 0,
    telegramConnected: false,
  };

  await set(userRef(user.uid), profile);
  await set(ref(requireDb(), `leaderboard/${user.uid}`), {
    userId: user.uid,
    points: 0,
    wins: 0,
    rewards: 0,
    updatedAt: now,
  });
  return profile;
}

export function subscribeUserProfile(
  uid: string,
  cb: (profile: UserProfile | null) => void,
): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    cb(null);
    return () => {};
  }
  return onValue(userRef(uid), snap => {
    cb(snap.exists() ? (snap.val() as UserProfile) : null);
  });
}

export async function syncTelegramToUser(
  uid: string,
  data: { id?: number; username?: string; connected: boolean },
) {
  await update(userRef(uid), {
    telegramConnected: data.connected,
    telegramId: data.id || null,
    telegramUsername: data.username || null,
    telegramSyncedAt: Date.now(),
  });
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<
    Pick<
      UserProfile,
      | "username"
      | "bio"
      | "notifyTelegram"
      | "notifyEmail"
      | "profilePublic"
      | "walletAddress"
      | "avatar"
    >
  >,
): Promise<void> {
  await update(userRef(uid), { ...patch, updatedAt: Date.now() });
  if (patch.username || patch.avatar) {
    const lb: Partial<LeaderboardEntry> = { updatedAt: Date.now() };
    if (patch.username) lb.username = patch.username;
    if (patch.avatar) lb.avatar = patch.avatar;
    await update(ref(requireDb(), `leaderboard/${uid}`), lb);
  }
}

export async function bumpLeaderboardOnCreate(uid: string, username?: string): Promise<void> {
  const lbRef = ref(requireDb(), `leaderboard/${uid}`);
  const snap = await get(lbRef);
  const current = snap.exists()
    ? (snap.val() as LeaderboardEntry)
    : { userId: uid, points: 0, wins: 0, rewards: 0 };

  const nextPoints = (current.points || 0) + 10;
  await set(lbRef, {
    ...current,
    userId: uid,
    username: username || current.username || "Otter",
    points: nextPoints,
    wins: current.wins || 0,
    rewards: current.rewards || 0,
    updatedAt: Date.now(),
  });
  await update(userRef(uid), { points: nextPoints });
}

/** Al ganar un reto (confirmResult) — puntos + win + rewards */
export async function bumpLeaderboardOnWin(
  uid: string,
  payoutUsdc: number,
  username?: string,
): Promise<void> {
  const lbRef = ref(requireDb(), `leaderboard/${uid}`);
  const snap = await get(lbRef);
  const current = snap.exists()
    ? (snap.val() as LeaderboardEntry)
    : { userId: uid, points: 0, wins: 0, rewards: 0 };

  const nextPoints = (current.points || 0) + 50;
  const nextWins = (current.wins || 0) + 1;
  const nextRewards = (current.rewards || 0) + payoutUsdc;

  await set(lbRef, {
    ...current,
    userId: uid,
    username: username || current.username || "Otter",
    points: nextPoints,
    wins: nextWins,
    rewards: nextRewards,
    updatedAt: Date.now(),
  });
  await update(userRef(uid), { points: nextPoints });
}

export function subscribeLeaderboard(
  callback: (entries: LeaderboardEntry[]) => void,
): Unsubscribe {
  if (!db || !isFirebaseConfigured) {
    callback([]);
    return () => {};
  }
  return onValue(
    ref(db, "leaderboard"),
    snap => {
      if (!snap.exists()) {
        callback([]);
        return;
      }
      const raw = snap.val() as Record<string, LeaderboardEntry>;
      const list = Object.values(raw)
        .map(e => ({
          userId: e.userId,
          username: e.username || "Otter",
          avatar: e.avatar || "",
          points: Number(e.points) || 0,
          wins: Number(e.wins) || 0,
          rewards: Number(e.rewards) || 0,
          updatedAt: e.updatedAt,
        }))
        .sort((a, b) => b.points - a.points || b.wins - a.wins);
      callback(list);
    },
    err => {
      console.error("subscribeLeaderboard", err);
      callback([]);
    },
  );
}
