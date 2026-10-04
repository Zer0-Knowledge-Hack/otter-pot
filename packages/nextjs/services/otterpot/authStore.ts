import { create } from "zustand";
import type { User } from "firebase/auth";
import type { UserProfile } from "~~/services/firebase/realtime";

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
};

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  profile: null,
  loading: true,
  setUser: user => set({ user }),
  setProfile: profile => set({ profile }),
  setLoading: loading => set({ loading }),
}));
