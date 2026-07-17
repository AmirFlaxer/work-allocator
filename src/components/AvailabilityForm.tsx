import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canUseAvailabilityInput } from "@/lib/plan";
import { ShareAvailabilityContext } from "@/lib/availability";
import { getWeekDays, getHebrewDayLabels, toISODateLocal, parseISODate } from "@/lib/week";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarCheck } from "lucide-react";

interface AvailabilityFormProps {
  token: string;
}

type FormStatus = "loading" | "unavailable" | "ready" | "submitting" | "submitted" | "error";

interface FormState {
  status: FormStatus;
  context?: ShareAvailabilityContext;
  selected?: Set<string>;
}

// טופס עצמאי בעמוד השיתוף הציבורי - מאפשר לעובד לסמן ימים לא-זמינים לשבוע
// הפתוח אצל המנהל ולשלוח אותם. עצמאי מבחינת טעינה: לא תלוי בשליפת השיבוץ
// המפורסם שקורית באותו עמוד (get_shared_schedule) - הקשר שונה לגמרי.
export function AvailabilityForm({ token }: AvailabilityFormProps) {
  const [state, setState] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured || !canUseAvailabilityInput()) { setState({ status: "unavailable" }); return; }
    supabase!.rpc("get_share_availability_context", { share_token: token }).then(({ data, error }) => {
      const context = data as ShareAvailabilityContext | null;
      if (error || !context || !context.weekStart || !context.activeDays) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", context, selected: new Set(context.currentUnavailableDays ?? []) });
    });
  }, [token]);

  if (state.status === "loading" || state.status === "unavailable") return null;

  const { context, selected } = state as Required<FormState>;
  const weekStartDate = new Date(context.weekStart);
  const weekDays = getWeekDays(weekStartDate, context.activeDays);
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
    supabase!.rpc("submit_employee_availability", {
      share_token: token,
      week_start: toISODateLocal(weekStartDate),
      unavailable_dates: Array.from(selected),
    }).then(({ error }) => {
      setState({ status: error ? "error" : "submitted", context, selected });
    }).catch(err => {
      // כשל רשת (לא רק error בתשובה) לא אמור לתקוע את הטופס ב-submitting לצמיתות.
      console.error("שליחת זמינות נכשלה:", err);
      setState({ status: "error", context, selected });
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">הזמינות שלך לשבוע הבא</p>
      </div>
      <p className="text-xs text-muted-foreground">סמן/י את הימים בהם אינך זמין/ה. השינוי יישלח למנהל.</p>
      <div className="space-y-1.5">
        {weekDays.map((date, idx) => (
          <div key={date} className="flex items-center space-x-2 space-x-reverse">
            <Checkbox
              id={`avail-${date}`}
              checked={selected.has(date)}
              disabled={submitting}
              onCheckedChange={() => toggle(date)}
            />
            <Label htmlFor={`avail-${date}`} className="cursor-pointer text-sm">
              {hebrewDays[idx]}{" "}
              <span className="text-xs text-muted-foreground">
                ({parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})
              </span>
            </Label>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={submit} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח עדכון"}
      </Button>
      {state.status === "submitted" && <p className="text-xs text-primary font-medium">הזמינות עודכנה, תודה!</p>}
      {state.status === "error" && <p className="text-xs text-destructive font-medium">השליחה נכשלה, נסה/י שוב.</p>}
    </div>
  );
}
