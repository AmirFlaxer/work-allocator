import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canUseAbsenceReporting } from "@/lib/plan";
import { ShareAbsenceContext } from "@/lib/absence";
import { getWeekDays, getHebrewDayLabels, parseISODate } from "@/lib/week";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Thermometer } from "lucide-react";

interface AbsenceFormProps {
  token: string;
}

type FormStatus = "loading" | "unavailable" | "ready" | "submitting" | "submitted" | "error";

interface FormState {
  status: FormStatus;
  context?: ShareAbsenceContext;
  selected?: Set<string>;
}

// טופס דיווח היעדרות/מחלה בעמוד השיתוף. עצמאי מבחינת טעינה (הקשר נפרד
// מ-get_shared_schedule). מקור השבוע: published_schedules (השבוע שהעובד רואה).
export function AbsenceForm({ token }: AbsenceFormProps) {
  const [state, setState] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured || !canUseAbsenceReporting()) { setState({ status: "unavailable" }); return; }
    supabase!.rpc("get_share_absence_context", { share_token: token }).then(({ data, error }) => {
      const context = data as ShareAbsenceContext | null;
      if (error || !context || !context.weekStart || !context.activeDays) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", context, selected: new Set(context.currentSickDates ?? []) });
    }, (err: unknown) => {
      console.error("טעינת הקשר ההיעדרות נכשלה:", err);
      setState({ status: "unavailable" });
    });
  }, [token]);

  if (state.status === "loading" || state.status === "unavailable") return null;

  const { context, selected } = state as Required<FormState>;
  const weekDays = getWeekDays(parseISODate(context.weekStart), context.activeDays);
  const hebrewDays = getHebrewDayLabels(context.activeDays);
  const submitting = state.status === "submitting";

  const toggle = (date: string) => {
    if (submitting) return;
    const next = new Set(selected);
    if (next.has(date)) next.delete(date); else next.add(date);
    setState({ status: "ready", context, selected: next });
  };

  const submit = () => {
    setState({ status: "submitting", context, selected });
    supabase!.rpc("submit_absence_report", {
      share_token: token,
      week_dates: weekDays,
      sick_dates: Array.from(selected),
    }).then(
      ({ error }) => setState({ status: error ? "error" : "submitted", context, selected }),
      (err: unknown) => {
        console.error("שליחת דיווח ההיעדרות נכשלה:", err);
        setState({ status: "error", context, selected });
      },
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Thermometer className="h-4 w-4 text-destructive" />
        <p className="text-sm font-bold">דיווח היעדרות / מחלה</p>
      </div>
      <p className="text-xs text-muted-foreground">סמן/י ימים בהם לא תוכל/י להגיע. הדיווח יישלח למנהל.</p>
      <div className="space-y-1.5">
        {weekDays.map((date, idx) => (
          <div key={date} className="flex items-center space-x-2 space-x-reverse">
            <Checkbox
              id={`absence-${date}`}
              checked={selected.has(date)}
              disabled={submitting}
              onCheckedChange={() => toggle(date)}
            />
            <Label htmlFor={`absence-${date}`} className="cursor-pointer text-sm">
              {hebrewDays[idx]}{" "}
              <span className="text-xs text-muted-foreground">
                ({parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})
              </span>
            </Label>
          </div>
        ))}
      </div>
      <Button size="sm" variant="destructive" onClick={submit} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח דיווח"}
      </Button>
      {state.status === "submitted" && <p className="text-xs text-primary font-medium">הדיווח נשלח, תודה. רפואה שלמה!</p>}
      {state.status === "error" && <p className="text-xs text-destructive font-medium">השליחה נכשלה, נסה/י שוב.</p>}
    </div>
  );
}
