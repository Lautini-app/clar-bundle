import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, User } from "../api/client";

type AuthState = {
  user: User | null;
  isLoading: boolean;
  isAuthed: boolean;
  signInWithApple: (apple_user_id: string, email?: string, full_name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await api.clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const signInWithApple = useCallback(
    async (apple_user_id: string, email?: string, full_name?: string) => {
      const res = await api.signInWithApple(apple_user_id, email, full_name);
      await api.setToken(res.token);
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    await api.clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthed: !!user, signInWithApple, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
