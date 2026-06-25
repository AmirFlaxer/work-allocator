import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, ArrowRight, Building2, Mail, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Registrant {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string | null;
  organizations: { name: string } | null;
}

export function RegistrantsPage() {
  const navigate = useNavigate();
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at, organizations(name)")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRegistrants((data as Registrant[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">נרשמים</h1>
              <p className="text-sm text-muted-foreground">כל המשתמשים שנרשמו לאפליקציה</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowRight className="h-4 w-4 ml-1" />
            חזרה
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              סה"כ
              <Badge variant="secondary" className="text-sm font-semibold">{registrants.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && <p className="text-sm text-destructive text-center py-8">{error}</p>}
            {!loading && !error && registrants.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">אין נרשמים עדיין</p>
            )}
            {!loading && !error && registrants.length > 0 && (
              <div className="divide-y divide-border">
                {registrants.map((r) => (
                  <div key={r.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">{r.full_name ?? "—"}</p>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {r.email ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {r.organizations?.name ?? "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{r.role}</Badge>
                      {r.created_at && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(r.created_at).toLocaleDateString("he-IL")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
