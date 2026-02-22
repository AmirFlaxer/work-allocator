import { WeeklySchedule, Station } from "@/types/employee";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { calculateWorkloads } from "@/lib/scheduler";

interface ScheduleTableProps {
  schedule: WeeklySchedule;
  stations: Station[];
  weekStart: Date;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

function badgeStyle(shifts: number): string {
  if (shifts === 0) return "bg-slate-100 text-slate-600 hover:bg-slate-100";
  if (shifts <= 2)
    return "bg-green-100 text-green-700 hover:bg-green-100 border-green-200";
  if (shifts <= 3)
    return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200";
  return "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
}

function getWeekDays(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
export function ScheduleTable({ schedule, stations, weekStart }: ScheduleTableProps) {
  const weekDays = getWeekDays(weekStart).reverse();
  const hebrewDaysReversed = [...HEBREW_DAYS].reverse();
  const workloads = calculateWorkloads(schedule);

  const emptyPerDay = weekDays.map(date =>
    Object.values(schedule[date] ?? {}).filter(v => v === "").length
  );

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              {weekDays.map((date, idx) => {
                const empty = emptyPerDay[idx];
                return (
                  <TableHead
                    key={date}
                    className="text-center font-bold min-w-[140px] py-3"
                  >
                    <div className="text-sm">{hebrewDaysReversed[idx]}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {new Date(date).toLocaleDateString("he-IL", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                    {empty > 0 && (
                      <div className="text-xs text-red-500 font-normal mt-0.5">
                        {empty} חסרות
                      </div>
                    )}
                  </TableHead>
                );
              })}
              <TableHead className="font-bold text-right min-w-[120px]">
                עמדה
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stations.map(station => (
              <TableRow
                key={station.id}
                className="hover:bg-muted/30 transition-colors"
              >
                {weekDays.map(date => {
                  const name = schedule[date]?.[station.id] ?? "";
                  const shifts = workloads[name] ?? 0;
                  return (
                    <TableCell key={date} className="text-center py-3">
                      {name ? (
                        <Badge
                          variant="secondary"
                          className={`font-medium text-xs px-2.5 py-1 border ${badgeStyle(shifts)}`}
                          title={`${name}: ${shifts} משמרות השבוע`}
                        >
                          {name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">
                          ---
                        </span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="font-medium text-right py-3">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm">{station.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {station.id}
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-4 px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        <span className="font-medium">עומס:</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-200 inline-block" />
          נמוך (1-2)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-yellow-200 inline-block" />
          בינוני (3)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" />
          גבוה (4+)
        </span>
      </div>
    </Card>
  );
}
