"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  handicap: number | null;
  home_course: string | null;
  bio: string | null;
}

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (username: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: "not implemented" }),
  signUp: async () => ({ error: "not implemented" }),
  signOut: () => {},
  refreshProfile: async () => {},
});

const STORAGE_KEY = "sandbagger_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load session from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as Profile;
        setUser(session);
      }
    } catch {}
    setLoading(false);
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Login failed" };

      const profile = data.user as Profile;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
      return { error: null };
    } catch {
      return { error: "Network error" };
    }
  };

  const signUp = async (username: string, password: string, displayName: string) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, display_name: displayName }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Sign up failed" };

      const profile = data.user as Profile;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
      return { error: null };
    } catch {
      return { error: "Network error" };
    }
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sb_profiles")
      .select("id, username, display_name, handicap, home_course, bio")
      .eq("id", user.id)
      .single();
    if (data) {
      const profile = data as Profile;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
