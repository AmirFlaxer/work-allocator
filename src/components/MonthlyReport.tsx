import { useState, useMemo } from "react";
import { SavedSchedule, Station } from "@/types/employee";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, Printer, BarChart2, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import * as XLSX from "xlsx";

interface MonthlyReportProps {
  savedSchedules: SavedSchedule[];
  stations: Station[];
}

interface ShiftEntry { date: string; stationName: string; }
interface EmployeeReport { name: string; totalShifts: number; shifts: ShiftEntry[]; }

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"
];

const COLORS = ["#22c55e","#84cc16","#eab308","#f97316","#ef4444","#8b5cf6","#06b6d4","#ec4899"];

function buildReport(savedSchedules: SavedSchedule[], stations: Station[], month: number, year: number): EmployeeReport[] {
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

function buildStationReport(savedSchedules: SavedSchedule[], stations: Station[], month: number, year: number) {
  const stationMap = new Map(stations.map(s => [s.id, s.name]));
  const filled = new Map<number, number>();
  const total = new Map<number, number>();

  savedSchedules.forEach(saved => {
    Object.entries(saved.schedule).forEach(([date, daySlots]) => {
      const d = new Date(date);
      if (d.getMonth() !== month || d.getFullYear() !== year) return;
      Object.entries(daySlots).forEach(([stationId, empName]) => {
        const id = Number(stationId);
        total.set(id, (total.get(id) ?? 0) + 1);
        if (empName) filled.set(id, (filled.get(id) ?? 0) + 1);
      });
    });
  });

  return stations.map(s => ({
    name: stationMap.get(s.id) ?? `עמדה ${s.id}`,
    filled: filled.get(s.id) ?? 0,
    empty: (total.get(s.id) ?? 0) - (filled.get(s.id) ?? 0),
    total: total.get(s.id) ?? 0,
  })).filter(s => s.total > 0);
}

function buildHistoricalData(savedSchedules: SavedSchedule[], stations: Station[]) {
  const monthSet = new Set<string>();
  savedSchedules.forEach(s => {
    const d = new Date(s.weekStart);
    monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
  });

  return Array.from(monthSet)
    .sort()
    .slice(-6)
    .map(key => {
      const [y, m] = key.split("-").map(Number);
      const report = buildReport(savedSchedules, stations, m, y);
      const entry: Record<string, string | number> = {
        month: `${HEBREW_MONTHS[m]} ${y}`,
      };
      report.forEach(emp => { entry[emp.name] = emp.totalShifts; });
      return entry;
    });
}

export function MonthlyReport({ savedSchedules, stations }: MonthlyReportProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [showDetails, setShowDetails] = useState(false);

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

  const stationReport = useMemo(
    () => buildStationReport(savedSchedules, stations, month, year),
    [savedSchedules, stations, month, year]
  );

  const historicalData = useMemo(
    () => buildHistoricalData(savedSchedules, stations),
    [savedSchedules, stations]
  );

  const allEmployeeNames = useMemo(() => {
    const names = new Set<string>();
    historicalData.forEach(d => Object.keys(d).filter(k => k !== "month").forEach(n => names.add(n)));
    return Array.from(names);
  }, [historicalData]);

  const totalShifts = report.reduce((s, e) => s + e.totalShifts, 0);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`דוח משמרות חודשי — ${HEBREW_MONTHS[month]} ${year}`], [],
      ["שם עובד", 'סה"כ משמרות'],
      ...report.map(e => [e.name, e.totalShifts]),
      [], ['סה"כ', totalShifts],
    ]);
    ws1["!cols"] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, "סיכום");

    const detailData: (string | number)[][] = [
      [`פירוט משמרות — ${HEBREW_MONTHS[month]} ${year}`], [],
      ["שם עובד", "תאריך", "עמדה"],
    ];
    report.forEach(emp => emp.shifts.forEach(s => detailData.push([emp.name, s.date, s.stationName])));
    const ws2 = XLSX.utils.aoa_to_sheet(detailData);
    ws2["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "פירוט");

    const stData: (string | number)[][] = [
      [`דוח עמדות — ${HEBREW_MONTHS[month]} ${year}`], [],
      ["עמדה", "אוישה", "ריקה", 'סה"כ', "% אכלוס"],
      ...stationReport.map(s => [
        s.name, s.filled, s.empty, s.total,
        s.total > 0 ? Math.round((s.filled / s.total) * 100) + "%" : "0%"
      ]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(stData);
    ws3["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, "עמדות");

    XLSX.writeFile(wb, `דוח_שכר_${HEBREW_MONTHS[month]}_${year}.xlsx`);
  };

  const handleExportSingleEmployee = (emp: EmployeeReport) => {
    const wb = XLSX.utils.book_new();
    const data: (string | number)[][] = [
      [`דוח משמרות — ${emp.name}`],
      [`חודש: ${HEBREW_MONTHS[month]} ${year}`],
      [`סה"כ משמרות: ${emp.totalShifts}`],
      [],
      ["תאריך", "עמדה"],
      ...emp.shifts.map(s => [s.date, s.stationName]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 16 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, emp.name);
    XLSX.writeFile(wb, `דוח_${emp.name}_${HEBREW_MONTHS[month]}_${year}.xlsx`);
  };

  if (savedSchedules.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-muted-foreground">אין שיבוצים שמורים. שמור שיבוצים שבועיים כדי לייצר דוחות חודשיים.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" id="monthly-report-print">
      <Tabs defaultValue="monthly">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monthly">דוח חודשי</TabsTrigger>
          <TabsTrigger value="stations">דוח עמדות</TabsTrigger>
          <TabsTrigger value="history">גרף היסטורי</TabsTrigger>
        </TabsList>

        {/* ── Monthly ── */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4 no-print">
            <div className="space-y-1">
              <label className="text-sm font-medium">חודש</label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 mr-auto">
              <Switch id="show-details" checked={showDetails} onCheckedChange={setShowDetails} />
              <label htmlFor="show-details" className="text-sm cursor-pointer">פירוט לפי עובד</label>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 ml-2" /> ייצא Excel
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 ml-2" /> הדפס / PDF
              </Button>
            </div>
          </div>

          {/* Summary table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>סיכום — {HEBREW_MONTHS[month]} {year}</span>
                <Badge variant="secondary" className="text-base px-3 py-1">{totalShifts} משמרות סה"כ</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">לא נמצאו משמרות בחודש זה.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-right py-2 px-3 font-semibold">שם עובד</th>
                        <th className="text-center py-2 px-3 font-semibold">סה"כ</th>
                        <th className="text-right py-2 px-3 font-semibold">לפי עמדה</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.map((emp, i) => {
                        const stationCounts = new Map<string, number>();
                        emp.shifts.forEach(s => stationCounts.set(s.stationName, (stationCounts.get(s.stationName) ?? 0) + 1));
                        return (
                          <tr key={emp.name} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                            <td className="py-2 px-3 font-medium">{emp.name}</td>
                            <td className="py-2 px-3 text-center">
                              <Badge className={emp.totalShifts <= 2 ? "bg-green-100 text-green-700" : emp.totalShifts <= 10 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}>
                                {emp.totalShifts}
                              </Badge>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1">
                                {Array.from(stationCounts.entries()).map(([st, count]) => (
                                  <Badge key={st} variant="outline" className="text-xs">{st}: {count}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <Button size="sm" variant="ghost" onClick={() => handleExportSingleEmployee(emp)} title="ייצא לעובד זה">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
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

          {/* Detail cards */}
          {report.length > 0 && showDetails && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">פירוט לפי עובד</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {report.map(emp => (
                  <Card key={emp.name} className="overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-muted/30">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{emp.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{emp.totalShifts} משמרות</Badge>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleExportSingleEmployee(emp)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
        </TabsContent>

        {/* ── Stations ── */}
        <TabsContent value="stations" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">חודש</label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEBREW_MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">שנה</label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {stationReport.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">לא נמצאו נתוני עמדות לחודש זה.</p>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>אכלוס עמדות — {HEBREW_MONTHS[month]} {year}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stationReport} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v, n) => [v, n === "filled" ? "אוישה" : "ריקה"]} />
                    <Bar dataKey="filled" name="אוישה" fill="#22c55e" stackId="a" />
                    <Bar dataKey="empty" name="ריקה" fill="#fca5a5" stackId="a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right py-2 px-3 font-semibold">עמדה</th>
                      <th className="text-center py-2 px-3 font-semibold">אוישה</th>
                      <th className="text-center py-2 px-3 font-semibold">ריקה</th>
                      <th className="text-center py-2 px-3 font-semibold">% אכלוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationReport.map((s, i) => {
                      const pct = s.total > 0 ? Math.round((s.filled / s.total) * 100) : 0;
                      return (
                        <tr key={s.name} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                          <td className="py-2 px-3 font-medium">{s.name}</td>
                          <td className="py-2 px-3 text-center">{s.filled}</td>
                          <td className="py-2 px-3 text-center text-red-500">{s.empty}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs w-8">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {historicalData.length < 2 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">נדרשים לפחות 2 חודשים של שיבוצים שמורים לגרף היסטורי.</p>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>עומס עובדים — 6 חודשים אחרונים</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={historicalData}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    {allEmployeeNames.map((name, i) => (
                      <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} stackId="a" />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-3">
                  {allEmployeeNames.map((name, i) => (
                    <div key={name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                      {name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { direction: rtl; }
        }
      `}</style>
    </div>
  );
}
