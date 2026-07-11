import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

interface UpgradeDialogProps {
  /** סיבת החסימה להצגה; null = סגור */
  reason: string | null;
  onClose: () => void;
}

// דיאלוג גנרי לחסימת פיצ'ר/מכסה של התוכנית החינמית. מוצג רק כשאכיפת
// המכסות פעילה (ENFORCE_QUOTA ב-lib/plan.ts) - כרגע רדום.
export function UpgradeDialog({ reason, onClose }: UpgradeDialogProps) {
  return (
    <Dialog open={reason !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> יכולת בתוכנית Pro
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <p className="text-sm">
          לשדרוג לתוכנית Pro פנו אלינו דרך כפתור "צור קשר עם המפתח" שבכותרת האפליקציה.
        </p>
      </DialogContent>
    </Dialog>
  );
}
