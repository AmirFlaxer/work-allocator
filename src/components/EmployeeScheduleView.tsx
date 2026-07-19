import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildEmployeeViewRows } from "@/lib/employeeView";
import { getWeekDays, getHebrewDayLabels, parseISODate } from "@/lib/week";
import { getEmployeeColor } from "@/lib/employeeColors";

interface EmployeeScheduleViewProps {
  employees: Employee[];
  stations: Station[];
  schedule: WeeklySchedule;
  weekStart: Date;
  activeDays: number[];
  darkMode: boolean;
}

// תצוגה הפוכה לצפייה/הדפסה: שורות = עובדים, עמודות = ימים, תא = עמדות היום.
// צפייה בלבד - העריכה נשארת בתצוגה הרגילה.
export function EmployeeScheduleView({ employees, stations, schedule, weekStart, activeDays, darkMode }: EmployeeScheduleViewProps) {
  const weekDays = getWeekDays(weekStart, activeDays);
  const labels = getHebrewDayLabels(activeDays);
  const rows = buildEmployeeViewRows(employees, stations, schedule, weekDays);

  return (
    <div className="rounded-xl border border-border overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right font-bold">עובד</TableHead>
            {weekDays.map((date, i) => (
              <TableHead key={date} className="text-center">
                <div className="font-bold">{labels[i]}</div>
                <div className="text-xs text-muted-foreground">
                  {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                </div>
              </TableHead>
            ))}
            <TableHead className="text-center font-bold">סה"כ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={weekDays.length + 2} className="text-center text-muted-foreground py-6">
                אין עובדים עדיין
              </TableCell>
            </TableRow>
          ) : rows.map(row => (
            <TableRow key={row.name} className="hover:bg-accent/30">
              <TableCell className="font-medium whitespace-nowrap">
                <span
                  className="inline-block w-2 h-2 rounded-full ml-1.5"
                  style={{ background: getEmployeeColor(row.name, darkMode).accent }}
                />
                {row.name}
              </TableCell>
              {row.stationsPerDay.map((dayStations, i) => (
                <TableCell key={weekDays[i]} className="text-center text-sm">
                  {dayStations.length > 0
                    ? dayStations.join(", ")
                    : <span className="text-muted-foreground/40">-</span>}
                </TableCell>
              ))}
              <TableCell className="text-center font-semibold">{row.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
