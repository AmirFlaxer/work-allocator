import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export function ContactDeveloper() {
  const { user, profile } = useAuth();
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setName(profile?.full_name ?? "");
      setEmail(user?.email ?? "");
      setMessage("");
      setSent(false);
      setError(null);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!supabase) { setError("שגיאת חיבור"); return; }

    setLoading(true);
    setError(null);

    const { error: fnErr } = await supabase.functions.invoke("send-contact", {
      body: { senderName: name.trim(), senderEmail: email.trim(), message: message.trim() },
    });

    setLoading(false);
    if (fnErr) {
      setError("שגיאה בשליחה. נסה שוב.");
    } else {
      setSent(true);
      setTimeout(() => setOpen(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="פנה למפתח" className="rounded-xl gap-1.5">
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">פנה למפתח</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>פנייה למפתח</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="font-medium">ההודעה נשלחה!</p>
            <p className="text-sm text-muted-foreground">נחזור אליך בהקדם.</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">שם</Label>
                <Input id="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder="השם שלך" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">מייל לחזרה</Label>
                <Input id="contact-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" dir="ltr" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-msg">הודעה <span className="text-destructive">*</span></Label>
              <Textarea
                id="contact-msg"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="שאלה, בקשה, רעיון - הכל מתקבל בברכה"
                rows={5}
                className="resize-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>ביטול</Button>
              <Button onClick={handleSend} disabled={loading || !message.trim()}>
                {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                שלח
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
