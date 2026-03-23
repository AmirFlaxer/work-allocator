import { useState, useRef } from "react";
import { WeeklySchedule, Station, Employee, AuditEntry } from "@/types/employee";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Lock, LockOpen, Pencil, X, Eye, History } from "lucide-react";
import { calculateWorkloads } from "@/lib/scheduler";

interface ScheduleTableProps {
  schedule: WeeklySchedule;
  stations: Station[];
  employees: Employee[];
  weekStart: Date;
  lockedCells: Set<string>;
  auditLog: { [cellKey: string]: AuditEntry[] };
  onCellEdit: (date: string, stationId: number, employeeName: string) => void;
  onSwapCells: (date1: string, stationId1: number, date2: string, stationId2: number) => void;
  onToggleLock: (date: string, stationId: number) => void;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

function cellKey(date: string, stationId: number) {
  return `${date}__${stationId}`;
}

function badgeStyle(shifts: number): string {
  if (shifts === 0) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  if (shifts <= 2) return "bg-gradient-to-l from-emerald-50 to-green-100 text-emerald-700 border-emerald-200 shadow-sm dark:from-emerald-900/40 dark:to-green-900/40 dark:text-emerald-300 dark:border-emerald-800";
  if (shifts <= 3) return "bg-gradient-to-l from-amber-50 to-yellow-100 text-amber-700 border-amber-200 shadow-sm dark:from-amber-900/40 dark:to-yellow-900/40 dark:text-amber-300 dark:border-amber-800";
  return "bg-gradient-to-l from-red-50 to-rose-100 text-red-700 border-red-200 shadow-sm dark:from-red-900/40 dark:to-rose-900/40 dark:text-red-300 dark:border-red-800";
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

function nameColor(name: string): string {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
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
  lockedCells, auditLog, onCellEdit, onSwapCells, onToggleLock,
}: ScheduleTableProps) {
  const weekDays = getWeekDays(weekStart);
  const hebrewDaysReversed = HEBREW_DAYS;
  const workloads = calculateWorkloads(schedule);

  // Edit dialog
  const [editCell, setEditCell] = useState<{ date: string; stationId: number } | null>(null);

  // Employee detail dialog
  const [viewEmployee, setViewEmployee] = useState<string | null>(null);

  // Audit log dialog
  const [auditCell, setAuditCell] = useState<string | null>(null);

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

    // Swap atomically — no conflict check needed
    onSwapCells(targetDate, targetStationId, src.date, src.stationId);
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
              <TableRow className="bg-gradient-to-l from-primary/8 to-violet-500/5 border-b-2 border-primary/10">
                {weekDays.map((date, idx) => (
                  <TableHead key={date} className="text-center font-semibold min-w-[150px] py-3">
                    <div className="text-sm font-bold text-foreground">{hebrewDaysReversed[idx]}</div>
                    <div className="text-xs font-normal text-muted-foreground mt-0.5">
                      {new Date(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                    </div>
                    {emptyPerDay[idx] > 0 ? (
                      <div className="text-xs text-orange-500 font-medium mt-0.5">⚠ {emptyPerDay[idx]} ריקות</div>
                    ) : (
                      <div className="text-xs text-emerald-500 font-medium mt-0.5">✓ מלא</div>
                    )}
                  </TableHead>
                ))}
                <TableHead className="font-bold text-right min-w-[120px] text-foreground">עמדה</TableHead>
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
                                className={`font-medium text-xs px-2.5 py-1 rounded-full border select-none transition-all
                                  ${locked ? "ring-2 ring-orange-300 dark:ring-orange-700 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:scale-105"}
                                  ${badgeStyle(shifts)}
                                `}
                                title={`לחץ לעריכה${locked ? " (נעול)" : ""}`}
                                onClick={() => !locked && handleCellClick(date, station.id)}
                              >
                                {locked && <Lock className="h-2.5 w-2.5 ml-1 inline" />}
                                <span className={`inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br ${nameColor(name)} ml-1.5`} />
                                {name}
                              </Badge>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                                title={`פרטי ${name}`}
                                onClick={() => setViewEmployee(name)}
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="opacity-0 group-hover:opacity-60 transition-all text-xs cursor-pointer text-primary border border-dashed border-primary/40 rounded-full px-2.5 py-0.5 hover:opacity-100 hover:bg-primary/5 hover:border-primary/60"
                              onClick={() => handleCellClick(date, station.id)}
                            >
                              + שבץ
                            </button>
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
                          {(auditLog[key]?.length ?? 0) > 0 && (
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="היסטוריית שינויים"
                              onClick={() => setAuditCell(key)}
                            >
                              <History className="h-3 w-3" />
                            </button>
                          )}
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
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t bg-gradient-to-l from-muted/30 to-transparent text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/60">עומס שבועי:</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-sm" /> 1-2</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-sm" /> 3</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block shadow-sm" /> 4+</span>
          <span className="flex items-center gap-1.5 mr-1"><Lock className="h-3 w-3 text-orange-400" /> נעול</span>
          <span className="mr-auto opacity-50">לחץ · גרור להחלפה · 👁 פרטים · 🕐 היסטוריה · 🔒 נעילה</span>
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

      {/* Audit log dialog */}
      <Dialog open={!!auditCell} onOpenChange={open => !open && setAuditCell(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> היסטוריית שינויים
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {[...(auditLog[auditCell ?? ""] ?? [])].reverse().map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                <span className="text-muted-foreground text-xs min-w-[90px]">
                  {new Date(entry.timestamp).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={entry.from ? "line-through text-muted-foreground" : "text-muted-foreground italic"}>
                  {entry.from || "ריק"}
                </span>
                <span className="text-muted-foreground">←</span>
                <span className={entry.to ? "font-medium" : "text-muted-foreground italic"}>
                  {entry.to || "ריק"}
                </span>
              </div>
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
