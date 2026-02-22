import { useState, useRef } from "react";
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
import { Lock, LockOpen, Pencil, X } from "lucide-react";
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
  if (shifts === 0) return "bg-slate-100 text-slate-600";
  if (shifts <= 2) return "bg-green-100 text-green-700 border-green-200";
  if (shifts <= 3) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-red-100 text-red-700 border-red-200";
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

  // Edit dialog
  const [editCell, setEditCell] = useState<{ date: string; stationId: number } | null>(null);

  // Employee detail dialog
  const [viewEmployee, setViewEmployee] = useState<string | null>(null);

  // Drag state
  const dragSource = useRef<{ date: string; stationId: number; name: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const emptyPerDay = weekDays.map(date =>
    Object.values(schedule[date] ?? {}).filter(v => v === "").length
  );

  const handleCellClick = (date: string, stationId: number) => {
    if (lockedCells.has(cellKey(date, stationId))) return;
    setEditCell({ date, stationId });
  };

  const handleSelectEmployee = (name: string) => {
    if (!editCell) return;
    onCellEdit(editCell.date, editCell.stationId, name);
    setEditCell(null);
  };

  // Drag handlers
  const handleDragStart = (date: string, stationId: number, name: string) => {
    if (lockedCells.has(cellKey(date, stationId))) return;
    dragSource.current = { date, stationId, name };
  };

  const handleDrop = (targetDate: string, targetStationId: number) => {
    const src = dragSource.current;
    if (!src) return;
    if (lockedCells.has(cellKey(targetDate, targetStationId))) return;
    if (src.date === targetDate && src.stationId === targetStationId) return;

    // Swap
    const targetName = schedule[targetDate]?.[targetStationId] ?? "";
    onCellEdit(targetDate, targetStationId, src.name);
    onCellEdit(src.date, src.stationId, targetName);
    dragSource.current = null;
    setDragOver(null);
  };

  // Employee view: all shifts this week
  const employeeWeekShifts = viewEmployee
    ? weekDays.flatMap(date =>
        stations
          .filter(s => schedule[date]?.[s.id] === viewEmployee)
          .map(s => ({
            day: hebrewDaysReversed[weekDays.indexOf(date)],
            date,
            station: s.name,
          }))
      )
    : [];

  return (
    <>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                {weekDays.map((date, idx) => (
                  <TableHead key={date} className="text-center font-bold min-w-[150px] py-3">
                    <div className="text-sm">{hebrewDaysReversed[idx]}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {new Date(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                    </div>
                    {emptyPerDay[idx] > 0 && (
                      <div className="text-xs text-red-500 mt-0.5">⚠️ {emptyPerDay[idx]} חסרות</div>
                    )}
                  </TableHead>
                ))}
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
                    const isDragOver = dragOver === key;

                    return (
                      <TableCell
                        key={date}
                        className={`text-center py-2 px-2 transition-colors ${isDragOver ? "bg-primary/10" : ""}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(key); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={() => handleDrop(date, station.id)}
                      >
                        <div className="flex items-center justify-center gap-1 group">
                          {name ? (
                            <div className="flex items-center gap-0.5">
                              <Badge
                                variant="secondary"
                                draggable={!locked}
                                onDragStart={() => handleDragStart(date, station.id, name)}
                                onDragEnd={() => { dragSource.current = null; setDragOver(null); }}
                                className={`font-medium text-xs px-2 py-1 border select-none
                                  ${locked ? "ring-1 ring-orange-300 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}
                                  ${badgeStyle(shifts)}
                                `}
                                title={`לחץ לעריכה${locked ? " (נעול)" : ""}`}
                                onClick={() => !locked && handleCellClick(date, station.id)}
                              >
                                {locked && <Lock className="h-2.5 w-2.5 ml-1 inline" />}
                                {name}
                              </Badge>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                title={`פרטי ${name}`}
                                onClick={() => setViewEmployee(name)}
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-muted-foreground/60 text-xs cursor-pointer hover:text-primary px-2 py-1 rounded hover:bg-primary/5 transition-colors"
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
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-200 inline-block" /> נמוך (1-2)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-200 inline-block" /> בינוני (3)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" /> גבוה (4+)</span>
          <span className="flex items-center gap-1 mr-2"><Lock className="h-3 w-3 text-orange-400" /> נעול</span>
          <span className="mr-auto text-muted-foreground/60">לחץ לעריכה · גרור להחלפה · 👁 לפרטי עובד · 🔒 לנעילה</span>
        </div>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editCell} onOpenChange={open => !open && setEditCell(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> בחר עובד לתא
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => handleSelectEmployee("")}
            >
              — רוקן תא —
            </Button>
            {employees.map(emp => (
              <Button
                key={emp.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleSelectEmployee(emp.name)}
              >
                {emp.hasStar && "⭐ "}{emp.name}
                {emp.notes && (
                  <span className="mr-auto text-xs text-muted-foreground truncate max-w-[140px]">
                    {emp.notes}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee detail dialog */}
      <Dialog open={!!viewEmployee} onOpenChange={open => !open && setViewEmployee(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{viewEmployee}</span>
              <Badge variant="secondary">{workloads[viewEmployee ?? ""] ?? 0} משמרות השבוע</Badge>
            </DialogTitle>
          </DialogHeader>
          {employeeWeekShifts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">אין משמרות השבוע</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-1 font-medium">יום</th>
                  <th className="text-right py-1 font-medium">עמדה</th>
                </tr>
              </thead>
              <tbody>
                {employeeWeekShifts.map((s, i) => (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    <td className="py-1.5">{s.day}</td>
                    <td className="py-1.5 text-muted-foreground">{s.station}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {viewEmployee && employees.find(e => e.name === viewEmployee)?.notes && (
            <div className="mt-2 p-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
              <span className="font-medium text-foreground">הערות: </span>
              {employees.find(e => e.name === viewEmployee)?.notes}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
