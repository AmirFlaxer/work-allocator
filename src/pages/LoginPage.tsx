import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Mail, Lock, User, CheckCircle2, XCircle } from "lucide-react";

import { PASSWORD_RULES, isPasswordValid } from "@/lib/password";
import { isPasswordPwned, pwnedMessage } from "@/lib/pwned";

// בדיקת דליפה משותפת לשני המסכים שקובעים סיסמה. מחזירה הודעת-שגיאה או null.
// כשל-פתוח: אם השירות אינו זמין הפונקציה מחזירה null וההרשמה ממשיכה.
async function pwnedError(password: string): Promise<string | null> {
  const result = await isPasswordPwned(password);
  return result?.pwned ? pwnedMessage(result.count) : null;
}

// מסך קביעת-סיסמה אחרי לחיצה על קישור-השחזור מהמייל. הקישור יוצר session תקף,
// ולכן AuthContext מסמן recoveryMode כדי שהמסך הזה יקדים את האפליקציה עצמה -
// אחרת המשתמש היה נוחת מחובר ולא מחליף סיסמה לעולם.
export function SetNewPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) return;
    setLoading(true);
    const leaked = await pwnedError(password);
    if (leaked) {
      toast({ title: "סיסמה דלופה", description: leaked, variant: "destructive" });
      setLoading(false);
      return;
    }
    const { error } = await updatePassword(password);
    if (error) toast({ title: "שגיאה", description: error, variant: "destructive" });
    else toast({ title: "הסיסמה עודכנה", description: "אפשר להמשיך לעבוד" });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-border/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-0.5 bg-primary" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">סיסמה חדשה</span>
          </div>
          <p className="text-sm text-muted-foreground">בחרו סיסמה חדשה לחשבון.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">סיסמה חדשה</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 8 תווים" className="pr-9" required />
              </div>
              {password.length > 0 && <PasswordChecklist password={password} />}
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90"
              disabled={loading || !isPasswordValid(password)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "עדכן סיסמה"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
              ביטול וחזרה למסך הכניסה
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// רשימת דרישות-הסיסמה - הופיעה רק בהרשמה, ונחוצה בכל מקום שקובעים בו סיסמה.
function PasswordChecklist({ password }: { password: string }) {
  return (
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
  );
}

// Shown when a user is authenticated but has no profile - a registration that
// was interrupted after the auth user was created (e.g. failed org insert or
// email-confirmation flow). Lets them finish creating the org and profile.
export function CompleteRegistrationPage() {
  const { user, completeRegistration, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading]   = useState(false);
  const [orgName, setOrgName]   = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await completeRegistration(orgName.trim(), fullName.trim());
    if (error) toast({ title: "שגיאה", description: error, variant: "destructive" });
    else toast({ title: "ברוך הבא!", description: `הארגון "${orgName}" נוצר בהצלחה` });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-border/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-0.5 bg-primary" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">השלמת הרשמה</span>
          </div>
          <p className="text-sm text-muted-foreground">
            החשבון {user?.email} קיים אבל ההרשמה לא הושלמה. השלם את פרטי הארגון כדי להתחיל.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">שם הארגון</Label>
              <div className="relative">
                <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="בית חולים / מרפאה / עסק..." className="pr-9" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">שמך המלא</Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="ישראל ישראלי" className="pr-9" required />
              </div>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "השלם הרשמה"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
              התנתק וחזור למסך הכניסה
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // מצב-שכחתי בתוך לשונית הכניסה, בלי route נוסף: קישור-השחזור חוזר לשורש
  // ונתפס ע"י אירוע PASSWORD_RECOVERY, ולכן אין צורך בכתובת ייעודית.
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent,  setResetSent]  = useState(false);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await requestPasswordReset(loginEmail);
    if (error) toast({ title: "שגיאה", description: error, variant: "destructive" });
    else setResetSent(true);
    setLoading(false);
  };

  const [orgName,      setOrgName]      = useState("");
  const [fullName,     setFullName]     = useState("");
  const [regEmail,     setRegEmail]     = useState("");
  const [regPassword,  setRegPassword]  = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) toast({ title: "שגיאת כניסה", description: error, variant: "destructive" });
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(regPassword)) return;
    setLoading(true);
    const leaked = await pwnedError(regPassword);
    if (leaked) {
      toast({ title: "סיסמה דלופה", description: leaked, variant: "destructive" });
      setLoading(false);
      return;
    }
    const { error } = await signUp(regEmail, regPassword, orgName, fullName);
    if (error) {
      toast({ title: "שגיאת הרשמה", description: error, variant: "destructive" });
    } else {
      toast({ title: "ברוך הבא!", description: `הארגון "${orgName}" נוצר בהצלחה` });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row" dir="rtl">

      {/* Masthead column - right side in RTL */}
      <div className="lg:flex-1 flex flex-col justify-center px-8 lg:px-16 py-12 bg-primary/5 border-b lg:border-b-0 lg:border-l border-border">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-6 h-0.5 bg-primary" />
          <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">מערכת שיבוץ עובדים</span>
        </div>
        <h1 className="text-5xl lg:text-6xl masthead-title text-foreground mb-4">שיבוץ<br />שבועי חכם</h1>
        <p className="text-muted-foreground text-lg max-w-sm">פלטפורמה לניהול שיבוצים - כל ארגון מקבל סביבת נתונים מבודדת ומאובטחת.</p>
        <img src="/logo.svg" alt="" aria-hidden="true" className="w-12 h-12 rounded-xl mt-8" />
      </div>

      {/* Form column - left side in RTL */}
      <div className="lg:flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Auth card */}
          <Card className="shadow-xl border-border/40">
            <CardContent className="pt-6">
              <Tabs defaultValue="login">
                <TabsList className="w-full mb-6 bg-transparent p-0 gap-6 border-b border-border rounded-none h-auto">
                  <TabsTrigger
                    value="login"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary bg-transparent px-0 pb-2 font-medium"
                  >
                    כניסה
                  </TabsTrigger>
                  <TabsTrigger
                    value="register"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary bg-transparent px-0 pb-2 font-medium"
                  >
                    הרשמה
                  </TabsTrigger>
                </TabsList>

                {/* Login */}
                <TabsContent value="login">
                  {resetSent ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                        אם הכתובת רשומה במערכת - נשלח אליה קישור לאיפוס סיסמה.
                        בדקו גם בתיקיית הספאם.
                      </div>
                      <Button type="button" variant="ghost" className="w-full text-muted-foreground"
                        onClick={() => { setResetSent(false); setForgotMode(false); }}>
                        חזרה למסך הכניסה
                      </Button>
                    </div>
                  ) : forgotMode ? (
                    <form onSubmit={handleForgot} className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        הכניסו את כתובת המייל של החשבון ונשלח אליה קישור לבחירת סיסמה חדשה.
                      </p>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">אימייל</Label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                            placeholder="your@email.com" className="pr-9" required />
                        </div>
                      </div>
                      <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח קישור לאיפוס"}
                      </Button>
                      <Button type="button" variant="ghost" className="w-full text-muted-foreground"
                        onClick={() => setForgotMode(false)}>
                        חזרה
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">אימייל</Label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                            placeholder="your@email.com" className="pr-9" required />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">סיסמה</Label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                            placeholder="••••••••" className="pr-9" required />
                        </div>
                      </div>
                      <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "כניסה למערכת"}
                      </Button>
                      <button type="button" onClick={() => setForgotMode(true)}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                        שכחתי סיסמה
                      </button>
                    </form>
                  )}
                </TabsContent>

                {/* Register */}
                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0" />
                      יצירת ארגון חדש עם חשבון מנהל
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">שם הארגון</Label>
                      <div className="relative">
                        <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={orgName} onChange={e => setOrgName(e.target.value)}
                          placeholder="בית חולים / מרפאה / עסק..." className="pr-9" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">שמך המלא</Label>
                      <div className="relative">
                        <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={fullName} onChange={e => setFullName(e.target.value)}
                          placeholder="ישראל ישראלי" className="pr-9" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">אימייל</Label>
                      <div className="relative">
                        <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                          placeholder="your@email.com" className="pr-9" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">סיסמה</Label>
                      <div className="relative">
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                          placeholder="לפחות 8 תווים" className="pr-9" required />
                      </div>
                      {regPassword.length > 0 && (
                        <ul className="space-y-1 pt-1">
                          {PASSWORD_RULES.map(rule => {
                            const ok = rule.test(regPassword);
                            return (
                              <li key={rule.id} className={`flex items-center gap-2 text-xs ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                {ok
                                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                                {rule.label}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={loading || !isPasswordValid(regPassword)}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "צור ארגון חדש"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
