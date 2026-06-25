import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface Profile {
  id: string;
  org_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
}

export interface Organization {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  org: Organization | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, orgName: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg]         = useState<Organization | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const loadProfile = async (userId: string) => {
    if (!supabase) return;
    const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!p) return;
    setProfile(p);
    const { data: o } = await supabase.from("organizations").select("*").eq("id", p.org_id).single();
    if (o) setOrg(o);
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setOrg(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase לא מוגדר" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? "מייל או סיסמה שגויים" : null };
  };

  const signUp = async (email: string, password: string, orgName: string, fullName: string) => {
    if (!supabase) return { error: "Supabase לא מוגדר" };

    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) return { error: "שגיאה בהרשמה - בדוק שהמייל תקין והסיסמה ארוכה מ-6 תווים" };
    if (!data.user) return { error: "שגיאה ביצירת המשתמש" };

    const orgId = crypto.randomUUID();
    const { error: orgError } = await supabase
      .from("organizations").insert({ id: orgId, name: orgName });
    if (orgError) return { error: "שגיאה ביצירת הארגון - נסה שוב" };

    const { error: profileError } = await supabase
      .from("profiles").insert({ id: data.user.id, org_id: orgId, role: "admin", full_name: fullName, email });
    if (profileError) return { error: "שגיאה ביצירת הפרופיל - נסה שוב" };

    await loadProfile(data.user.id);
    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setOrg(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, org, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
