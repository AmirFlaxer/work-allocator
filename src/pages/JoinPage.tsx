import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { InviteContext, classifyInvite } from "@/lib/team";
import { PASSWORD_RULES, isPasswordValid } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, UserPlus, CheckCircle2, XCircle } from "lucide-react";

/** מעטפת עמוד אחידה - כרטיס ממורכז באותה שפה עיצובית כמו CompleteRegistrationPage. */
function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-border/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-0.5 bg-primary" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">הצטרפות כמנהל</span>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { user, profile, org, loading: authLoading, acceptInvite, signUpAndJoin } = useAuth();
  const { toast } = useToast();

  const [ctx, setCtx] = useState<InviteContext | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  // כשל-רשת בטעינת ההזמנה - נבדל מ-token לא קיים (שם ה-RPC מחזיר null בלי שגיאה)
  const [ctxFailed, setCtxFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!supabase || !token) { setCtxLoaded(true); return; }
    supabase.rpc("get_invite_context", { invite_token: token }).then(({ data, error }) => {
      if (error) {
        console.error("get_invite_context failed:", error);
        setCtxFailed(true);
      }
      setCtx((data as InviteContext | null) ?? null);
      setCtxLoaded(true);
    });
  }, [token]);

  if (!isSupabaseConfigured) {
    return <JoinShell><p className="text-sm text-muted-foreground">המערכת אינה מחוברת לענן.</p></JoinShell>;
  }

  if (!ctxLoaded || authLoading) {
    return (
      <JoinShell>
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </JoinShell>
    );
  }

  if (ctxFailed) {
    return (
      <JoinShell>
        <p className="text-sm text-muted-foreground">שגיאה בטעינת ההזמנה - בדקו את החיבור לרשת ונסו לרענן.</p>
        <Button className="w-full" onClick={() => window.location.reload()}>רענון</Button>
      </JoinShell>
    );
  }

  const status = classifyInvite(ctx);
  if (status !== "valid") {
    const message = {
      not_found: "קישור ההזמנה אינו תקין.",
      expired:   "תוקף ההזמנה פג. בקשו מהמנהל קישור חדש.",
      used:      "קישור ההזמנה כבר מומש. אם זה הייתם אתם - היכנסו למערכת כרגיל.",
    }[status];
    return (
      <JoinShell>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button className="w-full" onClick={() => window.location.assign("/")}>למסך הכניסה</Button>
      </JoinShell>
    );
  }

  // משתמש מחובר שכבר שייך לארגון - אין ריבוי-ארגונים
  if (user && profile) {
    return (
      <JoinShell>
        <p className="text-sm text-muted-foreground">
          החשבון {user.email} כבר שייך {org?.name ? `לארגון "${org.name}"` : "לארגון קיים"}.
          לא ניתן להצטרף לארגון נוסף עם אותו חשבון.
        </p>
        <Button className="w-full" onClick={() => window.location.assign("/")}>חזרה למערכת</Button>
      </JoinShell>
    );
  }

  // משתמש מאומת בלי profile (הרשמה שנקטעה) - מימוש ישיר, בלי הרשמה מחדש
  const isExistingUser = Boolean(user && !profile);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!isExistingUser && !isPasswordValid(password)) return;
    setSubmitting(true);
    const { error } = isExistingUser
      ? await acceptInvite(token, fullName)
      : await signUpAndJoin(email, password, fullName, token);
    if (error) {
      toast({ title: "שגיאה", description: error, variant: "destructive" });
      setSubmitting(false);
    } else {
      toast({ title: "ברוכים הבאים!", description: `הצטרפת לארגון "${ctx?.orgName}"` });
      window.location.assign("/");
    }
  };

  return (
    <JoinShell>
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary flex items-center gap-2">
        <UserPlus className="h-4 w-4 shrink-0" />
        <span>
          הוזמנת לנהל את הארגון "{ctx?.orgName}"
          {ctx?.inviterName ? ` (ע"י ${ctx.inviterName})` : ""}
        </span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">שמך המלא</Label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="ישראל ישראלי" className="pr-9" required />
          </div>
        </div>
        {!isExistingUser && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">אימייל</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" className="pr-9" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">סיסמה</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 8 תווים" className="pr-9" required />
              </div>
              {password.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {PASSWORD_RULES.map(rule => {
                    const ok = rule.test(password);
                    return (
                      <li key={rule.id} className={`flex items-center gap-2 text-xs ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
        {isExistingUser && (
          <p className="text-xs text-muted-foreground">מצטרפים עם החשבון הקיים {user?.email}.</p>
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90"
          disabled={submitting || (!isExistingUser && !isPasswordValid(password))}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "הצטרפות לארגון"}
        </Button>
      </form>
    </JoinShell>
  );
}
