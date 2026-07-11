import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, ShieldCheck, Accessibility, BookOpen, Rocket } from "lucide-react";

export function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="אודות" className="rounded-xl hover:bg-primary/10">
          <Info className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">אודות</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            מערכת שיבוץ עובדים - כלי לחלוקת עבודה שבועית לצוותים: מי עובד, באיזו עמדה, באיזה יום.
          </p>

          {/* Guides */}
          <section className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-bold text-sm">מדריכים</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/getting-started.pdf" target="_blank" rel="noopener noreferrer">
                  <Rocket className="h-4 w-4 ml-1.5" /> מדריך התחלה מהירה
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/user-guide.pdf" target="_blank" rel="noopener noreferrer">
                  <BookOpen className="h-4 w-4 ml-1.5" /> מדריך מלא למשתמש
                </a>
              </Button>
            </div>
          </section>

          {/* Accessibility */}
          <section className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Accessibility className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-bold text-sm">נגישות</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>ניגודיות צבעים העומדת בתקן WCAG AA, כולל צבעי העובדים בטבלה</li>
              <li>ניווט מלא במקלדת עם סימון מיקוד ברור</li>
              <li>כיבוד העדפת "צמצום תנועה" של מערכת ההפעלה</li>
              <li>תמיכה מלאה בעברית ובכיווניות מימין לשמאל</li>
            </ul>
          </section>

          {/* Security */}
          <section className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-bold text-sm">אבטחת מידע</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>כל ארגון מקבל סביבת נתונים מבודדת ומאובטחת</li>
              <li>הפרדת נתונים נאכפת בשרת (Row Level Security), כך שאין גישה למידע של ארגון אחר</li>
              <li>התחברות מאובטחת עם חוקי סיסמה חזקים</li>
            </ul>
          </section>

          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            גרסה {__APP_VERSION__}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
