import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Employee, Station, WeeklySchedule, SavedSchedule, AuditEntry, ScheduleTemplate } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  BarChart2, Search, Undo2, Redo2, Copy, Moon, Sun,
  BookTemplate, Upload, AlertTriangle, CheckCircle2,
  Cloud, CloudOff, Loader2, LogOut, Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

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

const MAX_HISTORY = 30;

const Index = () => {
  const { toast } = useToast();
  const { user, profile, org, signOut } = useAuth();

  // ── Dark mode ──────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", String(darkMode));
  }, [darkMode]);

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

  // ── Schedule + Undo/Redo ───────────────────────────────
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(() => {
    try { return JSON.parse(localStorage.getItem("schedule") || "null"); } catch { return null; }
  });
  const [history, setHistory] = useState<WeeklySchedule[]>([]);
  const [future, setFuture] = useState<WeeklySchedule[]>([]);
  const [previousSchedule, setPreviousSchedule] = useState<WeeklySchedule | null>(null);
  const [showChanges, setShowChanges] = useState(true);

  const pushHistory = useCallback((prev: WeeklySchedule) => {
    setHistory(h => [...h.slice(-MAX_HISTORY), prev]);
    setFuture([]);
  }, []);

  const handleUndo = () => {
    if (history.length === 0 || !schedule) return;
    const prev = history[history.length - 1];
    setFuture(f => [schedule, ...f]);
    setHistory(h => h.slice(0, -1));
    setSchedule(prev);
    toast({ title: "בוטל ✓" });
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    if (schedule) setHistory(h => [...h, schedule]);
    setFuture(f => f.slice(1));
    setSchedule(next);
    toast({ title: "בוצע מחדש ✓" });
  };

  // ── Locked cells ───────────────────────────────────────
  const [lockedCells, setLockedCells] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("lockedCells");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // ── Lock warning dialog ────────────────────────────────
  const [lockWarningOpen, setLockWarningOpen] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState(false);

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

  // ── Templates ──────────────────────────────────────────
  const [templates, setTemplates] = useState<ScheduleTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("scheduleTemplates") || "[]"); } catch { return []; }
  });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateLoadOpen, setTemplateLoadOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // ── Audit log ──────────────────────────────────────────
  const [auditLog, setAuditLog] = useState<{ [cellKey: string]: AuditEntry[] }>(() => {
    try { return JSON.parse(localStorage.getItem("auditLog") || "{}"); } catch { return {}; }
  });

  // ── Import ref ─────────────────────────────────────────
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Supabase sync ──────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">(
    isSupabaseConfigured ? "syncing" : "idle"
  );
  const isRemoteUpdate = useRef(false);

  // ── Persist to localStorage + Supabase ─────────────────
  const syncToSupabase = useCallback((key: string, value: unknown) => {
    if (!isSupabaseConfigured || isRemoteUpdate.current || !profile?.org_id) return;
    setSyncStatus("syncing");
    supabase!.from("app_store")
      .upsert({ key, org_id: profile.org_id, value, updated_at: new Date().toISOString() })
      .then(({ error }) => setSyncStatus(error ? "error" : "synced"));
  }, [profile?.org_id]);

  useEffect(() => { localStorage.setItem("employees", JSON.stringify(employees)); syncToSupabase("employees", employees); }, [employees, syncToSupabase]);
  useEffect(() => { localStorage.setItem("stations", JSON.stringify(stations)); syncToSupabase("stations", stations); }, [stations, syncToSupabase]);
  useEffect(() => { if (schedule) { localStorage.setItem("schedule", JSON.stringify(schedule)); syncToSupabase("schedule", schedule); } }, [schedule, syncToSupabase]);
  useEffect(() => { localStorage.setItem("weekStart", weekStart.toISOString()); syncToSupabase("weekStart", weekStart.toISOString()); }, [weekStart, syncToSupabase]);
  useEffect(() => { localStorage.setItem("savedSchedules", JSON.stringify(savedSchedules)); syncToSupabase("savedSchedules", savedSchedules); }, [savedSchedules, syncToSupabase]);
  useEffect(() => { localStorage.setItem("lockedCells", JSON.stringify(Array.from(lockedCells))); syncToSupabase("lockedCells", Array.from(lockedCells)); }, [lockedCells, syncToSupabase]);
  useEffect(() => { localStorage.setItem("auditLog", JSON.stringify(auditLog)); syncToSupabase("auditLog", auditLog); }, [auditLog, syncToSupabase]);
  useEffect(() => { localStorage.setItem("scheduleTemplates", JSON.stringify(templates)); syncToSupabase("scheduleTemplates", templates); }, [templates, syncToSupabase]);

  // ── Load from Supabase on mount ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    supabase!.from("app_store").select("key, value").eq("org_id", profile.org_id).then(({ data, error }) => {
      if (error || !data) { setSyncStatus("error"); return; }
      isRemoteUpdate.current = true;
      const store = Object.fromEntries(data.map(r => [r.key, r.value]));
      if (store.employees)      setEmployees(store.employees as Employee[]);
      if (store.stations)       setStations(store.stations as Station[]);
      if (store.schedule)       setSchedule(store.schedule as WeeklySchedule);
      if (store.weekStart)      setWeekStart(new Date(store.weekStart as string));
      if (store.savedSchedules) setSavedSchedules(store.savedSchedules as SavedSchedule[]);
      if (store.scheduleTemplates) setTemplates(store.scheduleTemplates as ScheduleTemplate[]);
      if (store.lockedCells)    setLockedCells(new Set(store.lockedCells as string[]));
      if (store.auditLog)       setAuditLog(store.auditLog as { [k: string]: AuditEntry[] });
      setTimeout(() => { isRemoteUpdate.current = false; setSyncStatus("synced"); }, 200);
    });
  }, [profile?.org_id]);

  // ── Real-time subscription ─────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    const channel = supabase!
      .channel("app_store_realtime")
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "app_store",
        filter: `org_id=eq.${profile.org_id}`,
      }, ({ new: row }) => {
        const { key, value } = row as { key: string; value: unknown };
        isRemoteUpdate.current = true;
        if (key === "employees")         setEmployees(value as Employee[]);
        else if (key === "stations")     setStations(value as Station[]);
        else if (key === "schedule")     setSchedule(value as WeeklySchedule);
        else if (key === "weekStart")    setWeekStart(new Date(value as string));
        else if (key === "savedSchedules") setSavedSchedules(value as SavedSchedule[]);
        else if (key === "scheduleTemplates") setTemplates(value as ScheduleTemplate[]);
        else if (key === "lockedCells")  setLockedCells(new Set(value as string[]));
        else if (key === "auditLog")     setAuditLog(value as { [k: string]: AuditEntry[] });
        setTimeout(() => { isRemoteUpdate.current = false; setSyncStatus("synced"); }, 200);
        toast({ title: "השיבוץ עודכן ממכשיר אחר" });
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") setSyncStatus("synced");
        else if (status === "CHANNEL_ERROR") setSyncStatus("error");
      });
    return () => { supabase!.removeChannel(channel); };
  }, [profile?.org_id]);

  // ── Employee handlers ──────────────────────────────────
  const handleSaveEmployee = (data: Omit<Employee, "id"> & { id?: string }) => {
    if (data.id) {
      setEmployees(prev => prev.map(e => e.id === data.id ? data as Employee : e));
      toast({ title: "העובד עודכן" });
    } else {
      setEmployees(prev => [...prev, { ...data, id: Date.now().toString() }]);
      toast({ title: "העובד נוסף" });
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
    toast({ title: "העמדה נוספה" });
  };

  const handleEditStation = (id: number, name: string) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    toast({ title: "העמדה עודכנה" });
  };

  const handleDeleteStation = (id: number) => {
    setStations(prev => prev.filter(s => s.id !== id));
    toast({ title: "העמדה נמחקה" });
  };

  // ── Generate schedule ──────────────────────────────────
  const doGenerate = (keepLocked: boolean) => {
    if (employees.length === 0 || stations.length === 0) {
      toast({ title: "שגיאה", description: "יש להוסיף עובדים ועמדות", variant: "destructive" });
      return;
    }
    if (schedule) setPreviousSchedule(schedule);

    let baseSchedule: WeeklySchedule | null = null;
    if (keepLocked && schedule) {
      // Start from current locked cells
      baseSchedule = {};
      const weekDays = getWeekDays(weekStart);
      weekDays.forEach(date => {
        baseSchedule![date] = {};
        stations.forEach(st => {
          const key = cellKey(date, st.id);
          baseSchedule![date][st.id] = lockedCells.has(key) ? (schedule[date]?.[st.id] ?? "") : "";
        });
      });
    }

    const newSchedule = generateWeeklySchedule(employees, stations, weekStart, baseSchedule ?? undefined, lockedCells);
    if (schedule) pushHistory(schedule);
    setSchedule(newSchedule);
    toast({ title: "השיבוץ נוצר!" });
  };

  const handleGenerateSchedule = () => {
    if (lockedCells.size > 0) {
      setLockWarningOpen(true);
    } else {
      doGenerate(false);
    }
  };

  // ── Clone previous week ────────────────────────────────
  const handleCloneWeek = () => {
    if (!schedule) {
      toast({ title: "אין שיבוץ קיים לשכפל", variant: "destructive" });
      return;
    }
    const currentDays = getWeekDays(weekStart);
    const prevDays = getWeekDays(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000));

    const cloned: WeeklySchedule = {};
    currentDays.forEach((date, i) => {
      cloned[date] = { ...(schedule[prevDays[i]] ?? {}) };
    });

    if (schedule) pushHistory(schedule);
    setSchedule(cloned);
    toast({ title: "השבוע שוכפל מהשבוע הקודם" });
  };

  // ── Save/Load schedule ─────────────────────────────────
  const handleSaveSchedule = () => {
    if (!schedule || !scheduleName.trim()) {
      toast({ title: "שגיאה", description: "יש להזין שם", variant: "destructive" });
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
    toast({ title: `"${scheduleName}" נשמר` });
    setScheduleName("");
    setSaveDialogOpen(false);
  };

  const handleLoadSchedule = (saved: SavedSchedule) => {
    setSchedule(saved.schedule);
    setWeekStart(new Date(saved.weekStart));
    toast({ title: `"${saved.name}" נטען` });
  };

  const handleDeleteSavedSchedule = (id: string) => {
    setSavedSchedules(prev => prev.filter(s => s.id !== id));
    toast({ title: "נמחק מהארכיון" });
  };

  // ── Templates ──────────────────────────────────────────
  const handleSaveTemplate = () => {
    if (!schedule || !templateName.trim()) {
      toast({ title: "שגיאה", description: "יש להזין שם לתבנית", variant: "destructive" });
      return;
    }
    const entry: ScheduleTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      schedule,
      savedAt: new Date().toISOString(),
    };
    setTemplates(prev => [...prev, entry]);
    toast({ title: `תבנית "${templateName}" נשמרה` });
    setTemplateName("");
    setTemplateDialogOpen(false);
  };

  const handleLoadTemplate = (template: ScheduleTemplate) => {
    const templateDays = Object.keys(template.schedule).sort();
    const currentDays = getWeekDays(weekStart);
    const remapped: WeeklySchedule = {};
    currentDays.forEach((date, i) => {
      remapped[date] = { ...(template.schedule[templateDays[i]] ?? {}) };
    });
    if (schedule) pushHistory(schedule);
    setSchedule(remapped);
    setTemplateLoadOpen(false);
    toast({ title: `תבנית "${template.name}" נטענה` });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  // ── Import employees from Excel ────────────────────────
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const newEmployees: Employee[] = [];
        rows.slice(1).forEach(row => {
          const name = row[0]?.toString().trim();
          if (!name) return;
          const stationNames = (row[1] || "").toString().split(",").map(s => s.trim()).filter(Boolean);
          const stationIds = stationNames
            .map(sName => stations.find(s => s.name === sName)?.id)
            .filter((id): id is number => id !== undefined);
          const minShifts = Number(row[2]) || 0;
          const maxShifts = row[3] ? Number(row[3]) : undefined;
          const notes = row[4]?.toString().trim() || undefined;
          newEmployees.push({
            id: Date.now().toString() + Math.random(),
            name,
            availableStations: stationIds,
            hasStar: false,
            minWeeklyShifts: minShifts,
            maxWeeklyShifts: maxShifts,
            notes,
          });
        });
        if (newEmployees.length > 0) {
          setEmployees(prev => [...prev, ...newEmployees]);
          toast({ title: `יובאו ${newEmployees.length} עובדים` });
        } else {
          toast({ title: "לא נמצאו עובדים בקובץ", variant: "destructive" });
        }
      } catch {
        toast({ title: "שגיאה בקריאת הקובץ", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // ── Audit ───────────────────────────────────────────────
  const addAuditEntry = useCallback((date: string, stationId: number, from: string, to: string) => {
    const key = cellKey(date, stationId);
    const entry: AuditEntry = { from, to, timestamp: new Date().toISOString() };
    setAuditLog(prev => ({ ...prev, [key]: [...(prev[key] ?? []).slice(-19), entry] }));
  }, []);

  // ── Cell edit & lock ───────────────────────────────────
  const handleCellEdit = (date: string, stationId: number, employeeName: string) => {
    if (employeeName && schedule) {
      // Block double-assignment on same day
      const alreadyThisDay = Object.entries(schedule[date] ?? {}).some(
        ([sid, name]) => name === employeeName && Number(sid) !== stationId
      );
      if (alreadyThisDay) {
        toast({
          title: "שיבוץ כפול",
          description: `${employeeName} כבר משובץ/ת ביום זה בעמדה אחרת`,
          variant: "destructive",
        });
        return;
      }

      // Block exceeding maxWeeklyShifts
      const employee = employees.find(e => e.name === employeeName);
      if (employee?.maxWeeklyShifts != null) {
        const weekDays = getWeekDays(weekStart);
        const currentShifts = weekDays.filter(
          d => d !== date && Object.values(schedule[d] ?? {}).includes(employeeName)
        ).length;
        if (currentShifts + 1 > employee.maxWeeklyShifts) {
          toast({
            title: "חריגה ממקסימום משמרות",
            description: `${employeeName} כבר עם ${currentShifts} משמרות (מקסימום: ${employee.maxWeeklyShifts})`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    const currentValue = schedule?.[date]?.[stationId] ?? "";
    addAuditEntry(date, stationId, currentValue, employeeName);
    setSchedule(prev => {
      if (!prev) return prev;
      pushHistory(prev);
      return { ...prev, [date]: { ...prev[date], [stationId]: employeeName } };
    });
  };

  const handleSwapCells = (date1: string, stationId1: number, date2: string, stationId2: number) => {
    if (!schedule) return;
    const name1 = schedule[date1]?.[stationId1] ?? "";
    const name2 = schedule[date2]?.[stationId2] ?? "";
    addAuditEntry(date1, stationId1, name1, name2);
    addAuditEntry(date2, stationId2, name2, name1);
    setSchedule(prev => {
      if (!prev) return prev;
      pushHistory(prev);
      return {
        ...prev,
        [date1]: { ...prev[date1], [stationId1]: name2 },
        [date2]: { ...prev[date2], [stationId2]: name1 },
      };
    });
  };

  const handleToggleLock = (date: string, stationId: number) => {
    const key = cellKey(date, stationId);
    setLockedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); toast({ title: "נעילה בוטלה" }); }
      else { next.add(key); toast({ title: "התא ננעל 🔒" }); }
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
    toast({ title: "Excel הורד" });
  };

  const handleExportToImage = async () => {
    const el = document.getElementById("schedule-table");
    if (!el) return;
    try {
      const opts = { backgroundColor: "#ffffff", pixelRatio: 2, skipFonts: true };
      await toPng(el, opts).catch(() => {});
      const dataUrl = await toPng(el, opts);
      const link = document.createElement("a");
      link.download = `שיבוץ_${weekStart.toLocaleDateString("he-IL").replace(/\//g, "-")}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "התמונה הורדה" });
    } catch {
      toast({ title: "שגיאה בייצוא תמונה", variant: "destructive" });
    }
  };

  // ── Filtered employees ─────────────────────────────────
  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // ── Workload & coverage computations ──────────────────
  const workloadData = useMemo(() => {
    if (!schedule) return [];
    const days = getWeekDays(weekStart);
    return employees.map(emp => {
      const shifts = days.filter(d =>
        Object.values(schedule[d] ?? {}).includes(emp.name)
      ).length;
      return { emp, shifts };
    });
  }, [schedule, employees, weekStart]);

  const underScheduled = workloadData.filter(w => w.shifts < w.emp.minWeeklyShifts);

  const emptySlots = useMemo(() => {
    if (!schedule) return 0;
    return Object.values(schedule).reduce(
      (count, day) => count + Object.values(day).filter(v => !v).length, 0
    );
  }, [schedule]);

  // ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-border/60 glass shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shrink-0">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold gradient-text leading-tight">מערכת שיבוץ עובדים</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{employees.length} עובדים</span>
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">{stations.length} עמדות</span>
                {savedSchedules.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{savedSchedules.length} שמורים</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Org info */}
            {isSupabaseConfigured && org && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/8 border border-primary/20">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">{org.name}</span>
              </div>
            )}

            {/* Sync status */}
            {isSupabaseConfigured && (
              <div title={{ idle: "לא מחובר", syncing: "מסנכרן...", synced: "מסונכרן עם הענן", error: "שגיאת סנכרון" }[syncStatus]}>
                {syncStatus === "syncing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {syncStatus === "synced"  && <Cloud className="h-4 w-4 text-emerald-500" />}
                {syncStatus === "error"   && <CloudOff className="h-4 w-4 text-destructive" />}
              </div>
            )}
            {!isSupabaseConfigured && <CloudOff className="h-4 w-4 text-muted-foreground/40" title="נתונים מקומיים בלבד" />}

            {/* Dark mode */}
            <Button variant="ghost" size="icon" onClick={() => setDarkMode(d => !d)}
              title={darkMode ? "מצב בהיר" : "מצב כהה"} className="rounded-xl hover:bg-primary/10">
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {/* Logout */}
            {isSupabaseConfigured && user && (
              <Button variant="ghost" size="icon" onClick={signOut}
                title={`התנתק (${user.email})`} className="rounded-xl hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="schedule" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-muted/60 rounded-xl p-1 h-auto">
            <TabsTrigger value="stations" className="rounded-lg gap-1.5 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary dark:data-[state=active]:bg-slate-800 transition-all">
              <MapPin className="h-3.5 w-3.5" /><span className="hidden sm:inline">עמדות</span>
            </TabsTrigger>
            <TabsTrigger value="employees" className="rounded-lg gap-1.5 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary dark:data-[state=active]:bg-slate-800 transition-all">
              <Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">עובדים</span>
            </TabsTrigger>
            <TabsTrigger value="preferences" className="rounded-lg gap-1.5 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary dark:data-[state=active]:bg-slate-800 transition-all">
              <Calendar className="h-3.5 w-3.5" /><span className="hidden sm:inline">העדפות</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="rounded-lg gap-1.5 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary dark:data-[state=active]:bg-slate-800 transition-all">
              <Calendar className="h-3.5 w-3.5" /><span className="hidden sm:inline">שיבוץ</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded-lg gap-1.5 py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary dark:data-[state=active]:bg-slate-800 transition-all">
              <BarChart2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">דוחות</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Stations ── */}
          <TabsContent value="stations" className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-bold">ניהול עמדות</h2>
            </div>
            <StationManager stations={stations} onAdd={handleAddStation} onEdit={handleEditStation} onDelete={handleDeleteStation} />
          </TabsContent>

          {/* ── Employees ── */}
          <TabsContent value="employees" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-xl font-bold">ניהול עובדים</h2>
              </div>
              {!showEmployeeForm && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => importInputRef.current?.click()} title="ייבוא עובדים מקובץ Excel">
                    <Upload className="h-4 w-4 ml-2" /> ייבוא Excel
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportExcel}
                  />
                  <Button onClick={() => setShowEmployeeForm(true)}>
                    <Plus className="h-4 w-4 ml-2" /> הוסף עובד
                  </Button>
                </div>
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
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-bold">העדפות שבועיות</h2>
            </div>
            <WeeklyPreferences
              employees={employees}
              stations={stations}
              weekStart={weekStart}
              onUpdate={handleUpdateEmployee}
            />
          </TabsContent>

          {/* ── Schedule ── */}
          <TabsContent value="schedule" className="space-y-4">
            {/* Top bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-xl font-bold">שיבוץ שבועי</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Undo / Redo */}
                <Button variant="outline" size="icon" onClick={handleUndo} disabled={history.length === 0} title="בטל (Undo)">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleRedo} disabled={future.length === 0} title="בצע מחדש (Redo)">
                  <Redo2 className="h-4 w-4" />
                </Button>

                {/* Clone */}
                <Button variant="outline" onClick={handleCloneWeek} title="שכפל מהשבוע הקודם">
                  <Copy className="h-4 w-4 ml-2" />
                  <span className="hidden sm:inline">שכפל שבוע</span>
                </Button>

                {/* Templates */}
                {schedule && (
                  <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" title="שמור כתבנית">
                        <BookTemplate className="h-4 w-4 ml-2" />
                        <span className="hidden sm:inline">שמור תבנית</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl">
                      <DialogHeader><DialogTitle>שמור שיבוץ כתבנית</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <Label htmlFor="templateName">שם התבנית</Label>
                        <Input
                          id="templateName"
                          placeholder="לדוגמה: שיבוץ רגיל"
                          value={templateName}
                          onChange={e => setTemplateName(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveTemplate}>שמור</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {templates.length > 0 && (
                  <Dialog open={templateLoadOpen} onOpenChange={setTemplateLoadOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" title="טען תבנית">
                        <FolderOpen className="h-4 w-4 ml-2" />
                        <span className="hidden sm:inline">טען תבנית</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl">
                      <DialogHeader><DialogTitle>בחר תבנית לטעינה</DialogTitle></DialogHeader>
                      <div className="space-y-2 max-h-72 overflow-y-auto py-2">
                        {templates.map(t => (
                          <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50">
                            <div>
                              <p className="font-medium">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{new Date(t.savedAt).toLocaleDateString("he-IL")}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleLoadTemplate(t)}>טען</Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteTemplate(t.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Generate */}
                <Button onClick={handleGenerateSchedule} size="default">
                  <Calendar className="h-4 w-4 ml-2" /> צור שיבוץ
                </Button>

                {/* Save */}
                {schedule && (
                  <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Save className="h-4 w-4 ml-2" /> שמור
                      </Button>
                    </DialogTrigger>
                    <DialogContent dir="rtl">
                      <DialogHeader><DialogTitle>שמור שיבוץ לארכיון</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <Label htmlFor="scheduleName">שם השיבוץ</Label>
                        <Input
                          id="scheduleName"
                          placeholder="לדוגמה: שיבוץ ינואר שבוע א׳"
                          value={scheduleName}
                          onChange={e => setScheduleName(e.target.value)}
                        />
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
            <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-transparent to-violet-500/5 overflow-hidden">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <Button variant="outline" size="sm" onClick={handlePreviousWeek} className="gap-1 border-primary/30 hover:bg-primary/10 hover:text-primary">
                    <ChevronRight className="h-4 w-4" />
                    <span className="hidden sm:inline">קודם</span>
                  </Button>
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">שבוע</p>
                    <p className="font-bold text-lg leading-tight">
                      {weekStart.toLocaleDateString("he-IL", { day: "2-digit", month: "long" })}
                    </p>
                    <p className="text-xs text-muted-foreground">{weekStart.getFullYear()}</p>
                    <button onClick={handleToday} className="mt-1 text-xs text-primary hover:underline font-medium">
                      שבוע נוכחי
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleNextWeek} className="gap-1 border-primary/30 hover:bg-primary/10 hover:text-primary">
                    <span className="hidden sm:inline">הבא</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {schedule ? (
              <>
                {/* Coverage banner */}
                {(underScheduled.length > 0 || emptySlots > 0) && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-2 flex-1">
                      {emptySlots > 0 && (
                        <span className="text-sm text-orange-700 dark:text-orange-300">
                          {emptySlots} משבצות ריקות
                        </span>
                      )}
                      {underScheduled.length > 0 && (
                        <span className="text-sm text-orange-700 dark:text-orange-300">
                          · עובדים מתחת למינימום:{" "}
                          {underScheduled.map(w => `${w.emp.name} (${w.shifts}/${w.emp.minWeeklyShifts})`).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {underScheduled.length === 0 && emptySlots === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> השיבוץ מלא — כל העובדים קיבלו את מינימום המשמרות
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={handleExportToImage}>
                    <Image className="h-4 w-4 ml-1" /> PNG
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportToExcel}>
                    <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel
                  </Button>
                </div>

                <div id="schedule-table">
                  <ScheduleTable
                    schedule={schedule}
                    stations={stations}
                    employees={employees}
                    weekStart={weekStart}
                    lockedCells={lockedCells}
                    auditLog={auditLog}
                    onCellEdit={handleCellEdit}
                    onSwapCells={handleSwapCells}
                    onToggleLock={handleToggleLock}
                  />
                </div>

                {/* Workload dashboard */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart2 className="h-4 w-4" /> עומס עובדים השבוע
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {workloadData.map(({ emp, shifts }) => {
                        const max = emp.maxWeeklyShifts ?? 5;
                        const pct = Math.min((shifts / Math.max(max, 1)) * 100, 100);
                        const isUnder = shifts < emp.minWeeklyShifts;
                        const isOver = emp.maxWeeklyShifts != null && shifts > emp.maxWeeklyShifts;
                        const barColor = isOver ? "bg-red-500" : isUnder ? "bg-orange-400" : "bg-green-500";
                        return (
                          <div key={emp.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium truncate max-w-[80px]" title={emp.name}>{emp.name}</span>
                              <span className={`text-xs font-bold ${isOver ? "text-red-500" : isUnder ? "text-orange-500" : "text-green-600"}`}>
                                {shifts}/{emp.maxWeeklyShifts ?? "∞"}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-xs text-muted-foreground">מינ׳ {emp.minWeeklyShifts}</div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-3 p-4 border rounded-lg bg-accent/20">
                  <Switch id="show-changes" checked={showChanges} onCheckedChange={setShowChanges} />
                  <Label htmlFor="show-changes" className="cursor-pointer flex items-center gap-2">
                    {showChanges ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    השוואה לשבוע הקודם
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
              <div className="text-center py-16 rounded-2xl border-2 border-dashed border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <p className="text-lg font-semibold mb-1">אין שיבוץ פעיל</p>
                <p className="text-muted-foreground text-sm mb-5">לחץ על "צור שיבוץ" ליצירת טבלת שיבוץ שבועית</p>
                <Button onClick={handleGenerateSchedule} className="bg-gradient-to-l from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-200 dark:shadow-indigo-900/50">
                  <Calendar className="h-4 w-4 ml-2" /> צור שיבוץ
                </Button>
              </div>
            )}

            {/* Archive */}
            {savedSchedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" /> ארכיון שיבוצים
                  </CardTitle>
                  <CardDescription>בסיס הנתונים לדוחות החודשיים</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {savedSchedules.map(saved => (
                      <div key={saved.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex-1">
                          <p className="font-medium">{saved.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(saved.savedAt).toLocaleDateString("he-IL")} · שבוע {new Date(saved.weekStart).toLocaleDateString("he-IL")}
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
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-bold">דוחות לחשבות</h2>
            </div>
            <MonthlyReport savedSchedules={savedSchedules} stations={stations} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Lock warning dialog */}
      <AlertDialog open={lockWarningOpen} onOpenChange={setLockWarningOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>נמצאו {lockedCells.size} תאים נעולים</AlertDialogTitle>
            <AlertDialogDescription>
              האם לשמר את השיבוץ בתאים הנעולים ולמלא רק את השאר, או לאפס הכל וליצור שיבוץ חדש לגמרי?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => { setLockWarningOpen(false); doGenerate(true); }}>
              שמר נעולים
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { setLockWarningOpen(false); doGenerate(false); }}
            >
              אפס הכל
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
