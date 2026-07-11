import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, BookOpen, Rocket, X } from "lucide-react";

const BANNER_KEY = "guidesBannerDismissed";

/* Header button: opens a small dialog with both guides. */
export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">עזרה</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">מדריכים</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <a
            href="/getting-started.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 border border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Rocket className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-sm">מדריך התחלה מהירה</p>
              <p className="text-xs text-muted-foreground">4 צעדים ראשונים וטיפים - עמוד אחד</p>
            </div>
          </a>
          <a
            href="/user-guide.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 border border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-sm">מדריך מלא למשתמש</p>
              <p className="text-xs text-muted-foreground">כל הלשוניות והפיצ'רים, כולל שאלות נפוצות</p>
            </div>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* One-time banner for new users; dismiss persists in localStorage. */
export function GuidesBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(BANNER_KEY) === "1"; } catch { return true; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(BANNER_KEY, "1"); } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-primary/25 bg-primary/5 print:hidden">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Rocket className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <p className="font-bold text-sm">חדשים כאן? מדריך ההתחלה המהירה ילווה אתכם ב-4 צעדים</p>
        <p className="text-xs text-muted-foreground">המדריכים זמינים תמיד גם בכפתור "עזרה" למעלה</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" asChild>
          <a href="/getting-started.pdf" target="_blank" rel="noopener noreferrer">
            <Rocket className="h-4 w-4 ml-1.5" /> מדריך התחלה
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href="/user-guide.pdf" target="_blank" rel="noopener noreferrer">
            <BookOpen className="h-4 w-4 ml-1.5" /> מדריך מלא
          </a>
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={dismiss} title="סגור">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
