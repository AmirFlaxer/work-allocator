import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Building2, Mail, Lock, User } from "lucide-react";

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");

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
    setLoading(true);
    const { error } = await signUp(regEmail, regPassword, orgName, fullName);
    if (error) {
      toast({ title: "שגיאת הרשמה", description: error, variant: "destructive" });
    } else {
      toast({ title: "ברוך הבא!", description: `הארגון "${orgName}" נוצר בהצלחה` });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-background to-violet-50 dark:from-indigo-950/30 dark:via-background dark:to-violet-950/30 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">

        {/* Logo & title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50">
            <Users className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              מערכת שיבוץ עובדים
            </h1>
            <p className="text-muted-foreground text-sm mt-1">פלטפורמה לניהול שיבוצים חכם</p>
          </div>
        </div>

        {/* Auth card */}
        <Card className="shadow-xl border-border/40">
          <CardContent className="pt-6">
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/60 rounded-xl p-1">
                <TabsTrigger value="login"    className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">כניסה</TabsTrigger>
                <TabsTrigger value="register" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">הרשמה</TabsTrigger>
              </TabsList>

              {/* ── Login ── */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">אימייל</Label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                        placeholder="your@email.com" className="pr-9" required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">סיסמה</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                        placeholder="••••••••" className="pr-9" required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-l from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-200 dark:shadow-indigo-900/30" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "כניסה למערכת"}
                  </Button>
                </form>
              </TabsContent>

              {/* ── Register ── */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0" />
                    יצירת ארגון חדש עם חשבון מנהל
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">שם הארגון</Label>
                    <div className="relative">
                      <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={orgName} onChange={e => setOrgName(e.target.value)}
                        placeholder="בית חולים / מרפאה / עסק..." className="pr-9" required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">שמך המלא</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={fullName} onChange={e => setFullName(e.target.value)}
                        placeholder="ישראל ישראלי" className="pr-9" required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">אימייל</Label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                        placeholder="your@email.com" className="pr-9" required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">סיסמה</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                        placeholder="לפחות 6 תווים" minLength={6} className="pr-9" required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-l from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-200 dark:shadow-indigo-900/30" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "צור ארגון חדש"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          כל ארגון מקבל סביבת נתונים מבודדת ומאובטחת
        </p>
      </div>
    </div>
  );
}
