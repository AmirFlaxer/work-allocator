import { Employee, WeeklySchedule, Station } from "@/types/employee";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Pencil, Trash2, Layers } from "lucide-react";

interface EmployeeListProps {
  employees: Employee[];
  stations: Station[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  schedule?: WeeklySchedule | null;
}

function getShiftCount(name: string, schedule?: WeeklySchedule | null): number {
  if (!schedule) return 0;
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).filter(v => v === name).length,
    0
  );
}

const AVATAR_GRADIENTS = [
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-pink-400 to-rose-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-green-500",
  "from-cyan-400 to-sky-500",
  "from-teal-400 to-cyan-500",
  "from-fuchsia-400 to-pink-500",
];

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function avatarGradient(name: string): string {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function shiftStatus(shifts: number, min: number, max?: number): { label: string; classes: string; barColor: string } {
  if (shifts === 0)
    return { label: "לא משובץ", classes: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", barColor: "bg-slate-300" };
  if (max !== undefined && shifts > max)
    return { label: `${shifts} משמרות ↑`, classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", barColor: "bg-red-500" };
  if (shifts < min)
    return { label: `${shifts}/${min} משמרות`, classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", barColor: "bg-orange-400" };
  if (shifts <= 2)
    return { label: `${shifts} משמרות`, classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", barColor: "bg-emerald-500" };
  if (shifts <= 3)
    return { label: `${shifts} משמרות`, classes: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", barColor: "bg-yellow-400" };
  return { label: `${shifts} משמרות`, classes: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", barColor: "bg-red-500" };
}

export function EmployeeList({
  employees,
  stations,
  onEdit,
  onDelete,
  schedule,
}: EmployeeListProps) {
  if (employees.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-3">
          <span className="text-white text-xl">?</span>
        </div>
        <p className="text-muted-foreground font-medium">לא נמצאו עובדים</p>
        <p className="text-muted-foreground text-sm mt-1">הוסף עובד חדש להתחלה</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map(employee => {
        const shifts = getShiftCount(employee.name, schedule);
        const status = shiftStatus(shifts, employee.minWeeklyShifts, employee.maxWeeklyShifts);
        const max = employee.maxWeeklyShifts ?? 5;
        const pct = Math.min((shifts / Math.max(max, 1)) * 100, 100);

        const stationNames =
          employee.availableStations.length === 0
            ? [{ label: "כל העמדות", key: "all" }]
            : employee.availableStations.map(id => {
                const s = stations.find(st => st.id === id);
                return { label: s ? s.name : `עמדה ${id}`, key: String(id) };
              });

        return (
          <Card
            key={employee.id}
            className={`p-0 overflow-hidden card-hover border transition-all ${
              employee.hasStar
                ? "ring-1 ring-yellow-300 dark:ring-yellow-700 shadow-sm shadow-yellow-100 dark:shadow-yellow-900/20"
                : "hover:border-primary/30"
            }`}
          >
            {/* Top gradient accent */}
            <div className={`h-1 w-full bg-gradient-to-l ${avatarGradient(employee.name)}`} />

            <div className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarGradient(employee.name)} flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0`}>
                    {getInitials(employee.name)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm leading-tight truncate flex items-center gap-1">
                      {employee.name}
                      {employee.hasStar && (
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {employee.minWeeklyShifts}
                      {employee.maxWeeklyShifts !== undefined ? `–${employee.maxWeeklyShifts}` : "+"}
                      {" "}משמרות/שבוע
                    </p>
                  </div>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onEdit(employee)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(employee.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Workload bar */}
              <div className="mb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.classes}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{shifts}/{max}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${status.barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Stations */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">עמדות זמינות</p>
                <div className="flex flex-wrap gap-1">
                  {stationNames.map(({ label, key }) => (
                    <Badge key={key} variant="secondary" className="text-xs rounded-md px-1.5 py-0.5 bg-primary/8 text-primary border-primary/20">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {employee.notes && (
                <div className="mt-2.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5 italic border border-border/50">
                  {employee.notes}
                </div>
              )}

              {/* Footer */}
              {employee.canWorkMultipleStations && (
                <div className="mt-2.5 pt-2 border-t border-border/50">
                  <Badge variant="outline" className="text-xs gap-1 rounded-md">
                    <Layers className="h-3 w-3" />
                    יכול לעבוד במספר עמדות
                  </Badge>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
