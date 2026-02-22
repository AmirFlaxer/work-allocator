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
            <TableRow className="bg-prim
