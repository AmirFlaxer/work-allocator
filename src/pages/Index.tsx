import { useState, useEffect } from "react";
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EmployeeList } from "@/components/EmployeeList";
import { EmployeeForm } from "@/components/EmployeeForm";
import { StationManager } from "@/components/StationManager";
import { WeeklyPreferences } from "@/components/WeeklyPreferences";
import { ScheduleTable } from "@/components/ScheduleTable";
import { ScheduleChanges } from "@/components/ScheduleChanges";
import { MonthlyReport } from "@/components/MonthlyReport";
import { generateWeeklySchedule } from "@/lib/scheduler";
import {
  Plus, Calendar, Users, MapPin, Save, FolderOpen, Trash2,
  ChevronLeft, ChevronRight, Image, FileSpreadsheet, Eye, EyeOff,
  BarChart2, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";

function getNextSunday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + ((7 - result.getDay()) % 7));
  return result;
}

function getWeekDays(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function cellKey(date: string, stationId: number) {
  return `${date}__${stationId}`;
}

const Index = () => {
  const { toast } = useToast();

  // ── Employees ──────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try { return JSON.parse(localStorage.getItem("employees") || "[]"); } catch { return []; }
  });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  // ── Stations ───────────────────────────────────────────
  const [stations, setStations] = useState<Station[]>(() => {
    try { return JSON.parse(localStorage.getItem("stations") || "[]"); } catch { return []; }
  });

  // ── Schedule ───────────────────────────────────────────
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(() => {
    try { return JSON.parse(localStorage.getItem("schedule") || "null"); } catch { return null; }
  });
  const [previousSchedule, setPreviousSchedule] = useState<WeeklySchedule | null>(null);
  const [showChanges, setShowChanges] = useState(true);

  // ── Locked cells ───────────────────────────────────────
  const [lockedCells, setLockedCells] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("lockedCells");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // ── Week navigation ────────────────────────────────────
  const [weekStart, setWeekStart] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("weekStart");
      return saved ? new Date(saved) : getNextSunday(new Date());
    } catch { return getNextSunday(new Date()); }
  });

  // ── Saved schedules ────────────────────────────────────
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>(() => {
    try { return JSON.parse(localStorage.getItem("savedSchedules") || "[]"); } catch { return []; }
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");

  // ── Persist to localStorage ────────────────────────────
  useEffect(() => { localStorage.setItem("employees", JSON.stringify(employees)); }, [employees]);
  useEffect(() => { localStorage.setItem("stations", JSON.stringify(stations)); }, [stations]);
  useEffect(() => { if (schedule) localStorage.setItem("schedule", JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem("weekStart", weekStart.toISOString()); }, [weekStart]);
  useEffect(() => { localStorage.setItem("savedSchedules", JSON.stringify(savedSchedules)); }, [savedSchedules]);
  useEffect(() => { localStorage.setItem("lockedCells", JSON.stringify(Array.from(lockedCells))); }, [lockedCells]);

  // ── Employee handlers ──────────────────────────────────
  const handleSaveEmployee = (data: Omit<Employee, "id"> & { id?: string }) => {
    if (data.id) {
      setEmployees(prev => prev.map(e => e.id === data.id ? data as Employee : e));
      toast({ title: "העובד עודכן בהצלחה" });
    } else {
      setEmployees(prev => [...prev, { ...data, id: Date.now().toString() }]);
      toast({ title: "העובד נוסף בהצלחה" });
    }
    setShowEmployeeForm(false);
    setEditingEmployee(null);
  };

  const handleDeleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    toast({ title: "העובד נמחק" });
  };

  const handleUpdateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  // ── Station handlers ───────────────────────────────────
  const handleAddStation = (name: string) => {
    const newId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    setStations(prev => [...prev, { id: newId, name }]);
    toast({ title: "העמדה נוספה בהצלחה" });
  };

  const handleEditStation = (id: number, name: string) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    toast({ title: "העמדה עודכנה" });
  };

  const handleDeleteStation = (id: number) => {
    setStations(prev => prev.filter(s => s.id !== id));
    toast({ title: "העמדה נמחקה" });
  };

  // ── Schedule handlers ──────────────────────────────────
  const handleGenerateSchedule = () => {
    if (employees.length === 0 || stations.length === 0) {
      toast({ title: "שגיאה", description: "יש להוסיף עובדים ועמדות לפני יצירת שיבוץ", variant: "destructive" });
      return;
    }
    if (schedule) setPreviousSchedule(schedule);
    const newSchedule = generateWeeklySchedule(employees, stations, weekStart);
    setSchedule(newSchedule);
    toast({ title: "השיבוץ נוצר בהצלחה!" });
  };

  const handleSaveSchedule = () => {
    if (!schedule || !scheduleName.trim()) {
      toast({ title: "שגיאה", description: "יש להזין שם לשיבוץ", variant: "destructive" });
      return;
    }
    const entry: SavedSchedule = {
      id: Date.now().toString(),
      name: scheduleName.trim(),
      schedule,
      weekStart: weekStart.toISOString(),
      savedAt: new Date().toISOString(),
    };
    setSavedSchedules(prev => [...prev, entry]);
    toast({ title: `השיבוץ "${scheduleName}" נשמר` });
    setScheduleName("");
    setSaveDialogOpen(false);
  };

  const handleLoadSchedule = (saved: SavedSchedule) => {
    setSchedule(saved.schedule);
    setWeekStart(new Date(saved.weekStart));
    toast({ title: `השיבוץ "${saved.name}" נטען` });
  };

  const handleDeleteSavedSchedule = (id: string) => {
    setSavedSchedules(prev => prev.filter(s => s.id !== id));
    toast({ title: "השיבוץ נמחק מהארכיון" });
  };

  // ── Cell edit & lock ───────────────────────────────────
  const handleCellEdit = (date: string, stationId: number, employeeName: string) => {
    setSchedule(prev => {
      if (!prev) return prev;
      return { ...prev, [date]: { ...prev[date], [stationId]: employeeName } };
    });
  };

  const handleToggleLock = (date: string, stationId: number) => {
    const key = cellKey(date, stationId);
    setLockedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); toast({ title: "הנעילה בוטלה" }); }
      else { next.add(key); toast({ title: "התא ננעל — האלגוריתם לא ידרוס אותו" }); }
      return next;
    });
  };

  // ── Week navigation ────────────────────────────────────
  const handlePreviousWeek = () => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  const handleNextWeek    = () => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  const handleToday       = () => setWeekStart(getNextSunday(new Date()));

  // ── Export ─────────────────────────────────────────────
  const handleExportToExcel = () => {
    if (!schedule) return;
    const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];
    const weekDays = getWeekDays(weekStart);
    const headers = ["עמדה", ...HEBREW_DAYS.map((day, idx) =>
      `${day} (${new Date(weekDays[idx]).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})`
    )];
    const data = stations.map(station => [
      station.name,
      ...weekDays.map(date => schedule[date]?.[station.id] || "לא משובץ"),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "שיבוץ שבועי");
    XLSX.writeFile(wb, `שיבוץ_${weekStart.toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
    toast({ title: "קובץ האקסל הורד" });
  };

    const handleExportToImage = async () => {
    const el = document.getElementById("schedule-table");
    if (!el) {
      toast({ title: "שגיאה", description: "לא נמצאה טבלת השיבוץ", variant: "destructive" });
      return;
    }
    try {
      const filter = (node: HTMLElement) => {
        try {
          if (node.tagName === "STYLE") return false;
          if (node.tagName === "SCRIPT") return false;
          return true;
        } catch {
          return true;
        }
      };

      const options = {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        skipFonts: true,
        filter,
      };

      // Warm up pass
      await toPng(el, options).catch(() => {});
      // Real export
      const dataUrl = await toPng(el, options);
      const link = document.createElement("a");
      link.download = `שיבוץ_${weekStart.toLocaleDateString("he-IL").replace(/\//g, "-")}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "התמונה הורדה בהצלחה" });
    } catch (err) {
      console.error("export error:", err);
      toast({ title: "שגיאה בייצוא תמונה", description: String(err), variant: "destructive" });
    }
  };
  
  // ── Filtered employees ─────────────────────────────────
  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">מערכת שיבוץ עובדים</h1>
            <p className="text-muted-foreground text-sm">
              {employees.length} עובדים · {stations.length} עמדות
              {savedSchedules.length > 0 && ` · ${savedSchedules.length} שיבוצים שמורים`}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="schedule" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="stations" className="gap-1 text-xs sm:text-sm">
              <MapPin className="h-4 w-4" /><span className="hidden sm:inline">עמדות</span>
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-1 text-xs sm:text-sm">
              <Users className="h-4 w-4" /><span className="hidden sm:inline">עובדים</span>
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1 text-xs sm:text-sm">
              <Calendar className="h-4 w-4" /><span className="hidden sm:inline">העדפות</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1 text-xs sm:text-sm">
              <Calendar className="h-4 w-4" /><span className="hidden sm:inline">שיבוץ</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1 text-xs sm:text-sm">
              <BarChart2 className="h-4 w-4" /><span className="hidden sm:inline">דוחות</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Stations ── */}
          <TabsContent value="stations" className="space-y-6">
            <h2 className="text-2xl font-semibold">ניהול עמדות</h2>
            <StationManager
              stations={stations}
              onAdd={handleAddStation}
              onEdit={handleEditStation}
              onDelete={handleDeleteStation}
            />
          </TabsContent>

          {/* ── Employees ── */}
          <TabsContent value="employees" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">ניהול עובדים</h2>
              {!showEmployeeForm && (
                <Button onClick={() => setShowEmployeeForm(true)}>
                  <Plus className="h-4 w-4 ml-2" /> הוסף עובד
                </Button>
              )}
            </div>

            {showEmployeeForm ? (
              <EmployeeForm
                employee={editingEmployee || undefined}
                stations={stations}
                onSave={handleSaveEmployee}
                onCancel={() => { setShowEmployeeForm(false); setEditingEmployee(null); }}
              />
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חפש עובד..."
                    value={employeeSearch}
                    onChange={e => setEmployeeSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
                <EmployeeList
                  employees={filteredEmployees}
                  stations={stations}
                  schedule={schedule}
                  onEdit={emp => { setEditingEmployee(emp); setShowEmployeeForm(true); }}
                  onDelete={handleDeleteEmployee}
                />
              </>
            )}
          </TabsContent>

          {/* ── Preferences ── */}
          <TabsContent value="preferences" className="space-y-6">
            <h2 className="text-2xl font-semibold">העדפות שבועיות</h2>
            <WeeklyPreferences
              employees={employees}
              stations={stations}
              weekStart={weekStart}
              onUpdate={handleUpdateEmployee}
            />
          </TabsContent>

          {/* ── Schedule ── */}
          <TabsContent value="schedule" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">שיבוץ שבועי</h2>
              <div className="flex gap-2">
                <Button onClick={handleGenerateSchedule} size="lg">
                  <Calendar className="h-4 w-4 ml-2" /> צור שיבוץ
                </Button>
                {schedule && (
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="lg" variant="outline">
                        <Save className="h-4 w-4 ml-2" /> שמור
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl">
                      <DialogHeader>
                        <DialogTitle>שמור שיבוץ לארכיון</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="scheduleName">שם השיבוץ</Label>
                          <Input
                            id="scheduleName"
                            placeholder="לדוגמה: שיבוץ ינואר 2025 שבוע א׳"
                            value={scheduleName}
                            onChange={e => setScheduleName(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveSchedule}>שמור</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {/* Week navigator */}
            <Card className="bg-accent/20">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
                    <ChevronRight className="h-4 w-4" /> שבוע קודם
                  </Button>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm text-muted-foreground">שבוע מתחיל ב:</p>
                    <p className="font-semibold text-lg">
                      {weekStart.toLocaleDateString("he-IL", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                    <Button variant="ghost" size="sm" onClick={handleToday} className="text-xs">
                      חזור לשבוע הנוכחי
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleNextWeek}>
                    שבוע הבא <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {schedule ? (
              <>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleExportToImage}>
                    <Image className="h-4 w-4 ml-2" /> PNG
                  </Button>
                  <Button variant="outline" onClick={handleExportToExcel}>
                    <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                  </Button>
                </div>

                <div id="schedule-table">
                  <ScheduleTable
                    schedule={schedule}
                    stations={stations}
                    employees={employees}
                    weekStart={weekStart}
                    lockedCells={lockedCells}
                    onCellEdit={handleCellEdit}
                    onToggleLock={handleToggleLock}
                  />
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg bg-accent/20">
                  <Switch
                    id="show-changes"
                    checked={showChanges}
                    onCheckedChange={setShowChanges}
                  />
                  <Label htmlFor="show-changes" className="cursor-pointer flex items-center gap-2">
                    {showChanges ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    הצג השוואה לשבוע הקודם
                  </Label>
                </div>

                {showChanges && (
                  <ScheduleChanges
                    currentSchedule={schedule}
                    previousSchedule={previousSchedule}
                    stations={stations}
                    currentWeekStart={weekStart}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">לחץ על "צור שיבוץ" ליצירת טבלת שיבוץ שבועית</p>
              </div>
            )}

            {/* Archive */}
            {savedSchedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" /> ארכיון שיבוצים
                  </CardTitle>
                  <CardDescription>שיבוצים שמורים — בסיס הנתונים לדוחות החודשיים</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {savedSchedules.map(saved => (
                      <div key={saved.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex-1">
                          <p className="font-medium">{saved.name}</p>
                          <p className="text-sm text-muted-foreground">
                            נשמר {new Date(saved.savedAt).toLocaleDateString("he-IL")} · שבוע {new Date(saved.weekStart).toLocaleDateString("he-IL")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleLoadSchedule(saved)}>
                            <FolderOpen className="h-4 w-4 ml-1" /> טען
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteSavedSchedule(saved.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Reports ── */}
          <TabsContent value="reports" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">דוחות חודשיים לחשבות</h2>
            </div>
            <MonthlyReport
              savedSchedules={savedSchedules}
              stations={stations}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
