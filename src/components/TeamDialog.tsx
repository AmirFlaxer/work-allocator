import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { OrgMember, OrgInvite, inviteLink, inviteExpiry, pendingInvites, inviteErrorMessage } from "@/lib/team";
import { canUseAdditionalAdmins } from "@/lib/plan";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Copy, Trash2, Loader2, Check, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

// ניהול מנהלי הארגון: רשימה, הזמנה בקישור חד-פעמי, ביטול הזמנה, הסרת מנהל.
export function TeamDialog({ open, onOpenChange, orgId }: TeamDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  // fallback כשה-clipboard לא זמין: מציגים את הקישור לסימון ידני
  const [manualLink, setManualLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [profilesRes, invitesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, created_at")
        .eq("org_id", orgId).order("created_at"),
      supabase.from("org_invites").select("token, created_at, expires_at, used_by")
        .eq("org_id", orgId).order("created_at", { ascending: false }),
    ]);
    if (profilesRes.error) {
      console.error("טעינת מנהלים נכשלה:", profilesRes.error);
      toast({ title: "שגיאה בטעינת המנהלים", variant: "destructive" });
    }
    if (invitesRes.error) {
      console.error("טעינת הזמנות נכשלה:", invitesRes.error);
      toast({ title: "שגיאה בטעינת ההזמנות", variant: "destructive" });
    }
    setMembers((profilesRes.data ?? []) as OrgMember[]);
    setInvites(pendingInvites((invitesRes.data ?? []) as OrgInvite[], new Date()));
    setLoading(false);
  }, [orgId, toast]);

  useEffect(() => {
    if (open) { setConfirmRemoveId(null); setManualLink(null); load(); }
  }, [open, load]);

  const copyLink = async (token: string) => {
    const link = inviteLink(window.location.origin, token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setManualLink(null);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setManualLink(link);
    }
  };

  const handleCreateInvite = async () => {
    if (!supabase || !user) return;
    const token = crypto.randomUUID();
    const { error } = await supabase.from("org_invites").insert({
      token,
      org_id: orgId,
      created_by: user.id,
      expires_at: inviteExpiry(new Date()).toISOString(),
    });
    if (error) {
      console.error("יצירת הזמנה נכשלה:", error);
      toast({ title: "שגיאה ביצירת ההזמנה", variant: "destructive" });
      return;
    }
    setInvites(prev => [{ token, created_at: new Date().toISOString(), expires_at: inviteExpiry(new Date()).toISOString(), used_by: null }, ...prev]);
    await copyLink(token);
    toast({ title: "קישור ההזמנה נוצר", description: "שלחו אותו למנהל החדש - תקף לשבוע, לשימוש חד-פעמי" });
  };

  const handleCancelInvite = async (token: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("org_invites").delete().eq("token", token);
    if (error) {
      console.error("ביטול הזמנה נכשל:", error);
      toast({ title: "שגיאה בביטול ההזמנה", variant: "destructive" });
      return;
    }
    setInvites(prev => prev.filter(i => i.token !== token));
    toast({ title: "ההזמנה בוטלה" });
  };

  const handleRemove = async (member: OrgMember) => {
    if (!supabase) return;
    if (confirmRemoveId !== member.id) { setConfirmRemoveId(member.id); return; }
    const { data, error } = await supabase.rpc("remove_org_member", { target_id: member.id });
    if (error) {
      console.error("remove_org_member failed:", error);
      toast({ title: "שגיאה בהסרת המנהל", variant: "destructive" });
      return;
    }
    const result = data as { ok: boolean; reason?: string } | null;
    if (!result?.ok) {
      toast({ title: inviteErrorMessage(result?.reason), variant: "destructive" });
      return;
    }
    setMembers(prev => prev.filter(m => m.id !== member.id));
    setConfirmRemoveId(null);
    toast({ title: `${member.full_name ?? member.email ?? "המנהל"} הוסר מהארגון` });
  };

  const memberSince = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("he-IL") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> ניהול מנהלים
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          כל מנהל בארגון שווה-מעמד: עובדים, שיבוץ, פרסום והזמנת מנהלים נוספים.
        </p>
        {manualLink && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ההעתקה האוטומטית נכשלה - סמנו והעתיקו ידנית:</p>
            <Input readOnly value={manualLink} dir="ltr" onFocus={e => e.target.select()} />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* מנהלי הארגון */}
            <div className="space-y-1">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.full_name ?? m.email ?? "ללא שם"}
                      {m.id === user?.id && <span className="text-xs text-muted-foreground"> (אני)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email} · הצטרף {memberSince(m.created_at)}</p>
                  </div>
                  {m.id !== user?.id && (
                    <Button
                      size="sm"
                      variant={confirmRemoveId === m.id ? "destructive" : "ghost"}
                      onClick={() => handleRemove(m)}
                      title={confirmRemoveId === m.id ? "לחצו שוב לאישור ההסרה" : "הסר מהארגון"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmRemoveId === m.id && <span className="mr-1 text-xs">בטוח?</span>}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* הזמנות ממתינות */}
            {invites.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">הזמנות ממתינות</p>
                {invites.map(inv => (
                  <div key={inv.token} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-accent/30">
                    <span className="text-xs text-muted-foreground">
                      בתוקף עד {new Date(inv.expires_at).toLocaleDateString("he-IL")}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                        {copiedToken === inv.token
                          ? <><Check className="h-3.5 w-3.5 ml-1 text-emerald-500" /> הועתק</>
                          : <><Copy className="h-3.5 w-3.5 ml-1" /> העתק קישור</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancelInvite(inv.token)} title="בטל הזמנה">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* יצירת הזמנה */}
            {canUseAdditionalAdmins() && (
              <Button className="w-full" variant="outline" onClick={handleCreateInvite}>
                <UserPlus className="h-4 w-4 ml-1" /> הזמנת מנהל חדש
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
