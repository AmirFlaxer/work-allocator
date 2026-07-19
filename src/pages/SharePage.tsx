import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CalendarX } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { SharedScheduleResponse, viewerName, viewerShifts } from "@/lib/share";
import { getWeekDays, getHebrewDayLabels, cellNames, stationSlots, parseISODate } from "@/lib/week";
import { getEmployeeColor } from "@/lib/employeeColors";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { AbsenceForm } from "@/components/AbsenceForm";

type LoadState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "ready"; data: SharedScheduleResponse };

// עמוד ציבורי לצפייה בשיבוץ שפורסם - ללא התחברות. הזהות מגיעה מה-token.
export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [darkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!isSupabaseConfigured || !token) { setState({ status: "invalid" }); return; }
    supabase!.rpc("get_shared_schedule", { share_token: token }).then(({ data, error }) => {
      if (error || !data) setState({ status: "invalid" });
      else setState({ status: "ready", data: data as SharedScheduleResponse });
    });
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CalendarX className="h-8 w-8" />
          </div>
          <p className="text-lg font-semibold">הקישור בוטל או לא קיים</p>
          <p className="text-muted-foreground text-sm">בקשו קישור חדש מהמנהל</p>
        </div>
      </div>
    );
  }

  const { payload, publishedAt, viewerEmployeeId } = state.data;
  const myName = viewerName(payload, viewerEmployeeId);
  const myShifts = viewerShifts(payload, viewerEmployeeId);
  const weekDays = getWeekDays(parseISODate(payload.weekStart), payload.activeDays);
  const hebrewDays = getHebrewDayLabels(payload.activeDays);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.svg" alt="לוגו" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <span className="text-lg font-extrabold text-foreground leading-tight">השיבוץ השבועי</span>
            <p className="text-xs text-muted-foreground">
              עודכן: {new Date(publishedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-5">
        {/* המשמרות שלי */}
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs tracking-widest uppercase text-primary font-bold mb-1.5">
            המשמרות של {myName ?? "אורח"}
          </p>
          {myShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין לך משמרות בשבוע שפורסם</p>
          ) : (
            <p className="text-sm font-medium text-foreground">
              {myShifts.map(s => `${s.day} - ${s.stationName}`).join(" · ")}
            </p>
          )}
        </div>

        <AvailabilityForm token={token!} />

        <AbsenceForm token={token!} />

        {/* טבלת השיבוץ המלאה - קריאה בלבד */}
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-right font-bold py-3 px-3 min-w-[110px] border-l border-border">עמדה</th>
                  {weekDays.map((date, idx) => (
                    <th key={date} className="text-center py-3 px-2 min-w-[110px]">
                      <div className="font-bold">{hebrewDays[idx]}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.stations.flatMap(station => {
                  const slots = stationSlots(station);
                  return Array.from({ length: slots }, (_, slotIndex) => (
                    <tr key={`${station.id}-${slotIndex}`} className="border-b border-border last:border-0">
                      {slotIndex === 0 && (
                        <td rowSpan={slots} className="font-bold text-right py-2 px-3 border-l border-border align-middle">
                          {station.name}
                        </td>
                      )}
                      {weekDays.map(date => {
                        const name = cellNames(payload.schedule[date]?.[station.id])[slotIndex] ?? "";
                        const isMine = name !== "" && name === myName;
                        const color = name ? getEmployeeColor(name, darkMode) : null;
                        return (
                          <td key={date} className="text-center py-2 px-2">
                            {name ? (
                              <span
                                className={`inline-block text-xs font-medium px-2.5 py-1 rounded-md border ${isMine ? "ring-2 ring-primary font-bold" : ""}`}
                                style={color ? { background: color.bg, color: color.text, borderRight: `3px solid ${color.accent}` } : undefined}
                              >
                                {name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          לצפייה בלבד · נוצר עם מערכת השיבוץ השבועי
        </p>
      </main>
    </div>
  );
}
