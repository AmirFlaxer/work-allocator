import { useState, useMemo } from "react";
import { SavedSchedule, Station } from "@/types/employee";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Printer, BarChart2 } from "lucide-react";
import * as XLSX from "xlsx";

interface MonthlyReportProps {
  savedSchedules: SavedSchedule[];
  stations: Station[];
}

interface ShiftEntry {
  date: string;
  stationName: string;
}

interface EmployeeReport {
  name: string;
  totalShifts: number;
  shifts: ShiftEntry[];
}

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"
];

function buildReport(
  savedSchedules: SavedSchedule[],
  stations: Station[],
  month: number,
  year: number
): EmployeeReport[] {
  const stationMap = new Map(stations.map(s => [s.id, s.name]));
  const empMap = new Map<string, ShiftEntry[]>();

  savedSchedules.forEach(saved => {
    Object.entries(saved.schedule).forEach(([date, daySlots]) => {
      const d = new Date(date);
      if (d.getMonth() !== month || d.getFullYear() !== year) return;

      Object.entries(daySlots).forEach(([stationId, empName]) => {
        if (!empName) return;
        const stationName = stationMap.get(Number(stationId)) ?? `עמדה ${stationId}`;
        const entry: ShiftEntry = {
          date: d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }),
          stationName,
        };
        if (!empMap.has(empName)) empMap.set(empName, []);
        empMap.get(empName)!.push(entry);
      });
    });
  });

  // Deduplicate: same employee, same date → count once
  const result: EmployeeReport[] = [];
  empMap.forEach((shifts, name) => {
    const seen = new Set<string>();
    const unique = shifts.filter(s => {
      if (seen.has(s.date + s.stationName)) return false;
      seen.add(s.date + s.stationName);
      return true;
    });
    unique.sort((a, b) => a.date.localeCompare(b.date));
    result.push({ name, totalShifts: unique.length, shifts: unique });
  });

  return result.sort((a, b) => b.totalShifts - a.totalShifts);
}

export function MonthlyReport({ savedSchedules, stations }: MonthlyReportProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const years = useMemo(() => {
    const ys = new Set<number>();
    savedSchedules.forEach(s => ys.add(new Date(s.weekStart).getFullYear()));
    ys.add(now.getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [savedSchedules]);

  const report = useMemo(
    () => buildReport(savedSchedules, stations, month, year),
    [savedSchedules, stations, month, year]
  );

  const totalShifts = report.reduce((s, e) => s + e.totalShifts, 0);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      [`דוח משמרות חודשי — ${HEBREW_MONTHS[month]} ${year}`],
      [],
      ["שם עובד", "סה\"כ משמרות"],
      ...report.map(e => [e.name, e.totalShifts]),
      [],
      ["סה\"כ", totalShifts],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, "סיכום");

    // Sheet 2: Detailed
    const detailData = [
      [`פירוט משמרות — ${HEBREW_MONTHS[month]} ${year}`],
      [],
      ["שם עובד", "תאריך", "עמדה"],
    ];
    report.forEach(emp => {
      emp.shifts.forEach(s => {
        detailData.push([emp.name, s.date, s.stationName]);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(detailData);
    ws2["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "פירוט");

    XLSX.writeFile(wb, `דוח_שכר_${HEBREW_MONTHS[month]}_${year}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  if (savedSchedules.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-muted-foreground">
          אין שיבוצים שמורים. שמור שיבוצים שבועיים כדי לייצר דוחות חודשיים.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" id="monthly-report-print">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 no-print">
        <div className="space-y-1">
          <label className="text-sm font-medium">חודש</label>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEBREW_MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">שנה</label>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 mr-auto">
          <Button variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 ml-2" />
            ייצא Excel
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-2" />
            הדפס / PDF
          </Button>
        </div>
      </div>

      {/* Report title for print */}
      <div className="print-only hidden text-center mb-4">
        <h2 className="text-2xl font-bold">דוח משמרות — {HEBREW_MONTHS[month]} {year}</h2>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>סיכום חודשי — {HEBREW_MONTHS[month]} {year}</span>
            <Badge variant="secondary" className="text-base px-3 py-1">
              {totalShifts} משמרות סה"כ
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              לא נמצאו משמרות בחודש זה. בדוק שיש שיבוצים שמורים לתקופה זו.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right py-2 px-3 font-semibold">שם עובד</th>
                    <th className="text-center py-2 px-3 font-semibold">סה"כ משמרות</th>
                    <th className="text-right py-2 px-3 font-semibold">פירוט עמדות</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((emp, i) => {
                    const stationCounts = new Map<string, number>();
                    emp.shifts.forEach(s => {
                      stationCounts.set(s.stationName, (stationCounts.get(s.stationName) ?? 0) + 1);
                    });
                    return (
                      <tr key={emp.name} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <td className="py-2 px-3 font-medium">{emp.name}</td>
                        <td className="py-2 px-3 text-center">
                          <Badge
                            className={
                              emp.totalShifts <= 2
                                ? "bg-green-100 text-green-700"
                                : emp.totalShifts <= 3
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-blue-100 text-blue-700"
                            }
                          >
                            {emp.totalShifts}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(stationCounts.entries()).map(([st, count]) => (
                              <Badge key={st} variant="outline" className="text-xs">
                                {st}: {count}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed breakdown per employee */}
      {report.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">פירוט לפי עובד</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {report.map(emp => (
              <Card key={emp.name} className="overflow-hidden">
                <CardHeader className="py-3 px-4 bg-muted/30">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{emp.name}</span>
                    <Badge variant="secondary">{emp.totalShifts} משמרות</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-1 font-medium text-muted-foreground">תאריך</th>
                        <th className="text-right py-1 font-medium text-muted-foreground">עמדה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.shifts.map((s, i) => (
                        <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                          <td className="py-1">{s.date}</td>
                          <td className="py-1 text-muted-foreground">{s.stationName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { direction: rtl; }
        }
      `}</style>
    </div>
  );
}
