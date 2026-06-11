import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore, User } from "./api";

type AuthState =
  | { status: "loading" }
  | { status: "authed"; user: User }
  | { status: "guest" };

type Ctx = {
  state: AuthState;
  signIn: (phone_number: string, pin: string) => Promise<User>;
  signUp: (body: { phone_number?: string; full_name: string; surname: string; pin: string; role: "passenger" | "driver" | "owner"; vehicle_plate?: string; id_number?: string; email?: string; password?: string; business_name?: string; driver_mode?: boolean }) => Promise<User>;
  signInOwner: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const tok = await tokenStore.get();
      if (!tok) {
        setState({ status: "guest" });
        return;
      }
      const me = await api.me();
      setState({ status: "authed", user: me });
    } catch {
      await tokenStore.clear();
      setState({ status: "guest" });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (phone_number: string, pin: string) => {
    const r = await api.login({ phone_number, pin });
    await tokenStore.set(r.token);
    setState({ status: "authed", user: r.user });
    return r.user;
  }, []);

  const signUp = useCallback(
    async (body: { phone_number?: string; full_name: string; surname: string; pin: string; role: "passenger" | "driver" | "owner"; vehicle_plate?: string; id_number?: string; email?: string; password?: string; business_name?: string; driver_mode?: boolean }) => {
      const r = await api.register(body);
      await tokenStore.set(r.token);
      setState({ status: "authed", user: r.user });
      return r.user;
    },
    []
  );

  const signInOwner = useCallback(async (email: string, password: string) => {
    const r = await api.ownerLogin({ email, password });
    await tokenStore.set(r.token);
    setState({ status: "authed", user: r.user });
    return r.user;
  }, []);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setState({ status: "guest" });
  }, []);

  return <AuthCtx.Provider value={{ state, signIn, signUp, signInOwner, signOut, refresh }}>{children}</AuthCtx.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
