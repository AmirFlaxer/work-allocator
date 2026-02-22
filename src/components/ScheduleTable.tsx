import { useState } from "react";
import { WeeklySchedule, Station, Employee } from "@/types/employee";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Lock, LockOpen, Pencil } from "lucide-react";
import { calculateWorkloads } from "@/lib/scheduler";

interface ScheduleTableProps {
  schedule: WeeklySchedule;
  stations: Station[];
  employees: Employee[];
  weekStart: Date;
  lockedCells: Set<string>;
  onCellEdit: (date: string, stationId: number, employeeName: string) => void;
  onToggleLock: (date: string, stationId: number) => void;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

function cellKey(date: string, stationId: number) {
  return `${date}__${stationId}`;
}

function badgeStyle(shifts: number): string {
  if (shifts === 0) return "bg-slate-100 text-slate-600 hover:bg-slate-100";
  if (shifts <= 2) return "bg-green-100 text-green-700 hover:bg-green-100 border-green-200";
  if (shifts <= 3) return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200";
  return "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
}

function getWeekDays(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function ScheduleTable({
  schedule, stations, employees, weekStart,
  lockedCells, onCellEdit, onToggleLock,
}: ScheduleTableProps) {
  const weekDays = getWeekDays(weekStart).reverse();
  const hebrewDaysReversed = [...HEBREW_DAYS].reverse();
  const workloads = calculateWorkloads(schedule);

  const [editCell, setEditCell] = useState<{ date: string; stationId: number } | null>(null);

  const emptyPerDay = weekDays.map(date =>
    Object.values(schedule[date] ?? {}).filter(v => v === "").length
  );

  const handleCellClick = (date: string, stationId: number) => {
    if (lockedCells.has(cellKey(date, stationId))) return;
    setEditCell({ date, stationId });
  };

  const handleSelect = (name: string) => {
    if (!editCell) return;
    onCellEdit(editCell.date, editCell.stationId, name);
    setEditCell(null);
  };

  return (
    <>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                {weekDays.map((date, idx) => {
                  const empty = emptyPerDay[idx];
                  return (
                    <TableHead key={date} className="text-center font-bold min-w-[150px] py-3">
                      <div className="text-sm">{hebrewDaysReversed[idx]}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {new Date(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      </div>
                      {empty > 0 && (
                        <div className="text-xs text-red-500 font-normal mt-0.5">
                          ⚠️ {empty} חסרות
                        </div>
                      )}
                    </TableHead>
                  );
                })}
                <TableHead className="font-bold text-right min-w-[120px]">עמדה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stations.map(station => (
                <TableRow key={station.id} className="hover:bg-muted/30 transition-colors">
                  {weekDays.map(date => {
                    const name = schedule[date]?.[station.id] ?? "";
                    const shifts = workloads[name] ?? 0;
                    const key = cellKey(date, station.id);
                    const locked = lockedCells.has(key);

                    return (
                      <TableCell key={date} className="text-center py-2 px-2">
                        <div className="flex items-center justify-center gap-1 group">
                          {name ? (
                            <Badge
                              variant="secondary"
                              className={`font-medium text-xs px-2 py-1 border cursor-pointer ${badgeStyle(shifts)} ${locked ? "ring-1 ring-orange-300" : ""}`}
                              title={`${name}: ${shifts} משמרות השבוע${locked ? " (נעול)" : ""}`}
                              onClick={() => handleCellClick(date, station.id)}
                            >
                              {locked && <Lock className="h-2.5 w-2.5 ml-1 inline" />}
                              {name}
                            </Badge>
                          ) : (
                            <span
                              className="text-muted-foreground/60 text-xs cursor-pointer hover:text-primary transition-colors px-2 py-1 rounded hover:bg-primary/5"
                              onClick={() => handleCellClick(date, station.id)}
                            >
                              + שבץ
                            </span>
                          )}
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                            title={locked ? "בטל נעילה" : "נעל תא"}
                            onClick={() => onToggleLock(date, station.id)}
                          >
                            {locked
                              ? <Lock className="h-3 w-3 text-orange-400" />
                              : <LockOpen className="h-3 w-3 text-muted-foreground" />
                            }
                          </button>
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="font-medium text-right py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm">{station.name}</span>
                      <Badge variant="outline" className="text-xs">{station.id}</Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
          <span className="font-medium">עומס:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-200 inline-block" /> נמוך (1-2)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-yellow-200 inline-block" /> בינוני (3)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" /> גבוה (4+)
          </span>
          <span className="flex items-center gap-1 mr-2">
            <Lock className="h-3 w-3 text-orange-400" /> נעול
          </span>
          <span className="flex items-center gap-1 mr-auto text-xs text-muted-foreground/70">
            לחץ על תא לעריכה • העבר עכבר לנעילה
          </span>
        </div>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editCell} onOpenChange={open => !open && setEditCell(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              בחר עובד לתא
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => handleSelect("")}
            >
              — רוקן תא —
            </Button>
            {employees.map(emp => (
              <Button
                key={emp.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleSelect(emp.name)}
              >
                {emp.hasStar && "⭐ "}
                {emp.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
