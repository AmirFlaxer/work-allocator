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

function workloadLabel(
  shifts: number,
  max?: number
): { text: string; classes: string } {
  if (shifts === 0)
    return { text: "לא משובץ", classes: "bg-slate-100 text-slate-500" };
  if (shifts <= 2)
    return { text: `${shifts} משמרות`, classes: "bg-green-100 text-green-700" };
  if (shifts <= 3)
    return { text: `${shifts} משמרות`, classes: "bg-yellow-100 text-yellow-700" };
  return { text: `${shifts} משמרות`, classes: "bg-red-100 text-red-700" };
}

function borderColor(shifts: number): string {
  if (shifts === 0) return "border-r-slate-200";
  if (shifts <= 2) return "border-r-green-400";
  if (shifts <= 3) return "border-r-yellow-400";
  return "border-r-red-400";
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
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">
          לא נמצאו עובדים. הוסף עובד חדש להתחלה.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map(employee => {
        const shifts = getShiftCount(employee.name, schedule);
        const wl = workloadLabel(shifts, employee.maxWeeklyShifts);

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
            className={`p-4 border-r-4 transition-all hover:shadow-md ${borderColor(shifts)} ${
              employee.hasStar ? "ring-1 ring-yellow-200" : ""
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-base truncate">
                  {employee.name}
                </h3>
                {employee.hasStar && (
                  <Star className="h-4 w-4 flex-shrink-0 fill-yellow-400 text-yellow-400" />
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(employee)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onDelete(employee.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Workload pill */}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-3 ${wl.classes}`}
            >
              {wl.text}
            </span>

            {/* Stations */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">עמדות זמינות</p>
              <div className="flex flex-wrap gap-1">
                {stationNames.map(({ label, key }) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Notes */}
            {employee.notes && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 italic">
                {employee.notes}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t text-xs text-muted-foreground">
              <span>
                {employee.minWeeklyShifts}
                {employee.maxWeeklyShifts !== undefined
                  ? `–${employee.maxWeeklyShifts}`
                  : "+"}{" "}
                משמרות/שבוע
              </span>
              {employee.canWorkMultipleStations && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Layers className="h-3 w-3" />
                  מרובה
                </Badge>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
