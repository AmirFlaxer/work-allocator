import { WeeklySchedule, Station } from "@/types/employee";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ScheduleTableProps {
  schedule: WeeklySchedule;
  stations: Station[];
  weekStart: Date;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

export function ScheduleTable({ schedule, stations, weekStart }: ScheduleTableProps) {
  const weekDays = getWeekDays(weekStart).reverse();
  const hebrewDaysReversed = [...HEBREW_DAYS].reverse();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              {weekDays.map((date, idx) => (
                <TableHead key={date} className="text-center font-bold min-w-[150px]">
                  <div>{hebrewDaysReversed[idx]}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                  </div>
                </TableHead>
              ))}
              <TableHead className="font-bold text-right">עמדה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stations.map((station) => (
              <TableRow key={station.id}>
                {weekDays.map((date) => {
                  const employeeName = schedule[date]?.[station.id] || "";
                  return (
                    <TableCell key={date} className="text-center">
                      {employeeName ? (
                        <Badge variant="secondary" className="font-medium">
                          {employeeName}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">לא משובץ</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{station.id}</Badge>
                    <span>{station.name}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function getWeekDays(weekStart: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
}
