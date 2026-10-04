"use client";

import { useEffect, type ReactNode } from "react";
import { subscribeToAuth, isFirebaseConfigured } from "~~/services/firebase/auth";
import { ensureUserProfile, subscribeUserProfile } from "~~/services/firebase/realtime";
import { useAuthStore } from "~~/services/otterpot/authStore";

/** Solo Firebase — no depende de Wagmi (primer paint rápido). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, setProfile, setLoading } = useAuthStore();

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    let unsubProfile: (() => void) | undefined;
    let unsubAuth: (() => void) | undefined;

    try {
      unsubAuth = subscribeToAuth(async user => {
        setUser(user);
        unsubProfile?.();
        unsubProfile = undefined;

        if (!user) {
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          const profile = await ensureUserProfile(user, {
            username: user.displayName || user.email?.split("@")[0] || undefined,
          });
          setProfile(profile);
          unsubProfile = subscribeUserProfile(user.uid, p => setProfile(p));
        } catch (err) {
          console.error("Auth profile sync failed", err);
        } finally {
          setLoading(false);
        }
      });
    } catch (err) {
      console.error("Auth subscribe failed", err);
      setLoading(false);
    }

    const timeout = window.setTimeout(() => setLoading(false), 800);

    return () => {
      window.clearTimeout(timeout);
      unsubAuth?.();
      unsubProfile?.();
    };
  }, [setUser, setProfile, setLoading]);

  return children;
}
