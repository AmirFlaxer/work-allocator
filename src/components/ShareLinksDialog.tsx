import { useEffect, useState, useCallback } from "react";
import { Employee } from "@/types/employee";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Trash2, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  orgId: string;
}

// ניהול קישורי הצפייה האישיים: יצירה בהעתקה ראשונה, ביטול נקודתי.
export function ShareLinksDialog({ open, onOpenChange, employees, orgId }: ShareLinksDialogProps) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<{ [employeeId: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  // fallback כשה-clipboard לא זמין: מציגים את הקישור לסימון ידני
  const [manualLink, setManualLink] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("share_tokens").select("token, employee_id").eq("org_id", orgId);
    setTokens(Object.fromEntries((data ?? []).map(r => [r.employee_id as string, r.token as string])));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (open) { setConfirmRevokeId(null); setManualLink(null); loadTokens(); }
  }, [open, loadTokens]);

  const linkFor = (token: string) => `${window.location.origin}/s/${token}`;

  const handleCopy = async (emp: Employee) => {
    if (!supabase) return;
    let token = tokens[emp.id];
    if (!token) {
      token = crypto.randomUUID();
      const { error } = await supabase.from("share_tokens")
        .insert({ token, org_id: orgId, employee_id: emp.id });
      if (error) { toast({ title: "שגיאה ביצירת הקישור", variant: "destructive" }); return; }
      setTokens(prev => ({ ...prev, [emp.id]: token! }));
    }
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopiedId(emp.id);
      setManualLink(null);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setManualLink(linkFor(token));
    }
  };

  const handleRevoke = async (emp: Employee) => {
    if (!supabase) return;
    if (confirmRevokeId !== emp.id) { setConfirmRevokeId(emp.id); return; }
    const { error } = await supabase.from("share_tokens")
      .delete().eq("org_id", orgId).eq("employee_id", emp.id);
    if (error) { toast({ title: "שגיאה בביטול הקישור", variant: "destructive" }); return; }
    setTokens(prev => {
      const next = { ...prev };
      delete next[emp.id];
      return next;
    });
    setConfirmRevokeId(null);
    toast({ title: `הקישור של ${emp.name} בוטל` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> קישורי צפייה לצוות
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          לכל עובד קישור אישי קבוע לצפייה בשיבוץ שפורסם. שלחו בוואטסאפ פעם אחת - הוא ממשיך לעבוד גם אחרי החלפת מכשיר.
        </p>
        {manualLink && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ההעתקה האוטומטית נכשלה - סמנו והעתיקו ידנית:</p>
            <Input readOnly value={manualLink} dir="ltr" onFocus={e => e.target.select()} />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין עובדים עדיין</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                <span className="text-sm font-medium truncate">{emp.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleCopy(emp)}>
                    {copiedId === emp.id
                      ? <><Check className="h-3.5 w-3.5 ml-1 text-emerald-500" /> הועתק</>
                      : <><Copy className="h-3.5 w-3.5 ml-1" /> {tokens[emp.id] ? "העתק קישור" : "צור קישור"}</>}
                  </Button>
                  {tokens[emp.id] && (
                    <Button
                      size="sm"
                      variant={confirmRevokeId === emp.id ? "destructive" : "ghost"}
                      onClick={() => handleRevoke(emp)}
                      title={confirmRevokeId === emp.id ? "לחצו שוב לאישור הביטול" : "בטל קישור"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmRevokeId === emp.id && <span className="mr-1 text-xs">בטוח?</span>}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
