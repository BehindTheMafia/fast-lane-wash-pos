import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "cajero" | "owner" | "operator" | "manager";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  role: AppRole;
  raw_role?: string;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isCajero: boolean;
  isOwner: boolean;
  isOperator: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error);
    }

    if (data) {
      // Map operator/manager roles to cajero for compatibility in some parts
      // but preserve the original for specific permissions
      const role = data.role as string;
      const mappedRole = (role === "operator" || role === "manager") ? "cajero" : (role as AppRole);
      setProfile({ ...data, role: mappedRole, raw_role: role } as unknown as Profile);
    }
    setLoading(false);
  };

  // ── Session restriction helpers ──────────────────
  const registerSession = async (userId: string, token: string) => {
    try {
      // Upsert: if user already has a session, replace it (kicks out old device)
      await (supabase as any)
        .from("active_sessions")
        .upsert(
          {
            user_id: userId,
            session_token: token,
            device_info: navigator.userAgent?.substring(0, 200) || "unknown",
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch (e) {
      console.warn("Could not register session:", e);
    }
  };

  const validateSession = async (userId: string, token: string): Promise<boolean> => {
    try {
      const { data } = await (supabase as any)
        .from("active_sessions")
        .select("session_token")
        .eq("user_id", userId)
        .maybeSingle();

      if (data && data.session_token !== token) {
        // Another device took over — sign out
        console.warn("Session invalidated: another device logged in.");
        await supabase.auth.signOut();
        setProfile(null);
        setUser(null);
        setSession(null);
        alert("Tu sesión fue cerrada porque se inició sesión en otro dispositivo.");
        return false;
      }
      return true;
    } catch {
      // Table might not exist yet — ignore
      return true;
    }
  };

  const removeSession = async (userId: string) => {
    try {
      await (supabase as any)
        .from("active_sessions")
        .delete()
        .eq("user_id", userId);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Add small delay to allow trigger to create profile if needed
          // setLoading stays true until fetchProfile completes
          setTimeout(() => fetchProfile(session.user.id), 500);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        // Validate that this session is still the active one
        validateSession(session.user.id, session.access_token);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data?.session) {
      // Register this device as the active session (kicks out others)
      await registerSession(data.session.user.id, data.session.access_token);
    }
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, role: AppRole) => {
    // Map cajero to operator for database compatibility
    const dbRole = role === "cajero" ? "operator" : role === "owner" ? "owner" : role;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role: dbRole },
      },
    });
    return { error };
  };

  const signOut = async () => {
    if (user) {
      await removeSession(user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, loading, signIn, signUp, signOut,
        isAdmin: profile?.role === "admin",
        isCajero: profile?.role === "cajero",
        isOwner: profile?.role === "owner",
        isOperator: profile?.role === "operator" || (profile as any)?.raw_role === "operator",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
