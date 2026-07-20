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
import { EmployeeScheduleView } from "@/components/EmployeeScheduleView";
import { ScheduleChanges } from "@/components/ScheduleChanges";
import { MonthlyReport } from "@/components/MonthlyReport";
import { ContactDeveloper } from "@/components/ContactDeveloper";
import { AboutDialog } from "@/components/AboutDialog";
import { HelpDialog, GuidesBanner } from "@/components/HelpGuides";
import { ShareLinksDialog } from "@/components/ShareLinksDialog";
import { TeamDialog } from "@/components/TeamDialog";
import { generateWeeklySchedule } from "@/lib/scheduler";
import { getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS, ALL_HEBREW_DAYS, cellNames, stationSlots, cellKey, dailyShiftCap, parseISODate, toISODateLocal } from "@/lib/week";
import { buildPublishedPayload, hasUnpublishedChanges, PublishedPayload } from "@/lib/share";
import { mergeAvailabilitySubmissions } from "@/lib/availability";
import { AbsenceRecord, absencesForWeek, absentKeySet } from "@/lib/absence";
import { hasNextWeekParam, stripWeekParam } from "@/lib/weekParam";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Calendar, Users, MapPin, Save, FolderOpen, Trash2,
  ChevronLeft, ChevronRight, Image, FileSpreadsheet, Eye, EyeOff,
  BarChart2, Search, Undo2, Redo2, Copy, Moon, Sun,
  BookTemplate, Upload, AlertTriangle, CheckCircle2,
  Cloud, CloudOff, Loader2, LogOut, Building2, Megaphone, Share2, UserPlus,
  Thermometer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plan, ENFORCE_QUOTA, FREE_EMPLOYEE_LIMIT, FREE_STATION_LIMIT,
  getOrgPlan, isOverEmployeeQuota, isOverStationQuota,
  canUseMultiSlotStations, canUseMonthlyReports,
} from "@/lib/plan";
import { UpgradeDialog } from "@/components/UpgradeDialog";

function getNextSunday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + ((7 - result.getDay()) % 7));
  return result;
}

// מספר שבוע ISO. שבוע ISO מתחיל ביום שני, בעוד weekStart שלנו הוא יום ראשון -
// לכן מחשבים לפי יום שני של שבוע העבודה (יום אחרי), אחרת המספר שייך לשבוע הקודם.
function getWeekNumber(weekStart: Date): number {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 1);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

function formatWeekRange(weekStart: Date, activeDays: number[]): string {
  const days = getWeekDays(weekStart, activeDays);
  const s = parseISODate(days[0]).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" });
  const e = parseISODate(days[days.length - 1]).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return `${s} · ${e}`;
}

const MAX_HISTORY = 30;

// כל המפתחות המקומיים שמחזיקים נתוני ארגון (לא העדפות מכשיר כמו darkMode).
const ORG_DATA_KEYS = [
  "employees", "stations", "schedule", "weekStart", "savedSchedules",
  "scheduleTemplates", "lockedCells", "auditLog", "cellColors", "activeDays",
  "employeeView",
];

const Index = () => {
  const { toast } = useToast();
  const { user, profile, org, signOut } = useAuth();

  // המטמון המקומי אינו ממורחב לפי ארגון - אם התחבר כאן ארגון אחר, מנקים את
  // הנתונים שלו לפני שה-state מאותחל מהם (הבהוב נתונים זרים + סנכרון שגוי).
  // useMemo ולא useEffect: חייב לרוץ לפני אתחולי ה-useState שקוראים מהמטמון.
  useMemo(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    try {
      if (localStorage.getItem("localOrgId") !== profile.org_id) {
        ORG_DATA_KEYS.forEach(k => localStorage.removeItem(k));
        localStorage.setItem("localOrgId", profile.org_id);
      }
    } catch { /* localStorage לא זמין - ממשיכים */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dark mode ──────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("darkMode", String(darkMode));
  }, [darkMode]);

  // ── Cell colors preference ──────────────────────────────
  const [cellColors, setCellColors] = useState<boolean>(() => {
    const saved = localStorage.getItem("cellColors");
    return saved === null ? true : saved === "true";
  });

  // ── Employee-view preference ─────────────────────────────
  const [employeeView, setEmployeeView] = useState<boolean>(() => localStorage.getItem("employeeView") === "true");

  // ── Active work days ────────────────────────────────────
  const [activeDays, setActiveDays] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("activeDays");
      return saved ? JSON.parse(saved) : DEFAULT_ACTIVE_DAYS;
    } catch { return DEFAULT_ACTIVE_DAYS; }
  });

  // ── Employees ──────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try { return JSON.parse(localStorage.getItem("employees") || "[]"); } catch { return []; }
  });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  // ── דיווחי היעדרות (עובד -> מנהל) ────────────────────────
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);

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

  // ── Plan (freemium - רדום כל עוד ENFORCE_QUOTA כבוי) ───
  const [plan, setPlan] = useState<Plan>("free");
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);

  useEffect(() => {
    // אין טעם לשלוף את התוכנית כשהאכיפה כבויה - הכל מותר ממילא.
    if (!ENFORCE_QUOTA || !isSupabaseConfigured || !profile?.org_id) return;
    getOrgPlan(profile.org_id).then(setPlan);
  }, [profile?.org_id]);

  // ── Team share (פרסום לצוות) ────────────────────────────
  const [publishedPayload, setPublishedPayload] = useState<PublishedPayload | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    supabase!.from("published_schedules")
      .select("payload, published_at")
      .eq("org_id", profile.org_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPublishedPayload(data.payload as PublishedPayload);
          setPublishedAt(data.published_at as string);
        }
      });
  }, [profile?.org_id]);

  const unpublishedChanges = useMemo(
    () => hasUnpublishedChanges(publishedPayload, employees, stations, schedule, weekStart, activeDays),
    [publishedPayload, employees, stations, schedule, weekStart, activeDays],
  );

  const handlePublish = async () => {
    if (!schedule || !isSupabaseConfigured || !profile?.org_id) return;
    const payload = buildPublishedPayload(employees, stations, schedule, weekStart, activeDays);
    const now = new Date().toISOString();
    const { error } = await supabase!.from("published_schedules")
      .upsert({ org_id: profile.org_id, payload, published_at: now });
    if (error) {
      toast({ title: "שגיאה בפרסום", description: "בדקו את החיבור ונסו שוב", variant: "destructive" });
      return;
    }
    setPublishedPayload(payload);
    setPublishedAt(now);
    toast({ title: "השיבוץ פורסם לצוות" });
  };

  // ── Supabase sync ──────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">(
    isSupabaseConfigured ? "syncing" : "idle"
  );
  const isRemoteUpdate = useRef(false);
  const hasLoaded      = useRef(!isSupabaseConfigured);
  const syncTimers     = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});
  // ?week=next מהמייל השבועי - מיושם פעם אחת בלבד, אחרי שהטעינה הסתיימה
  const weekJumpPending = useRef(hasNextWeekParam(window.location.search));

  // קפיצה לשבוע הבא לפי הפרמטר מהמייל, וניקוי הפרמטר מה-URL כדי שרענון לא יקפיץ שוב
  const applyPendingWeekJump = useCallback(() => {
    if (!weekJumpPending.current) return;
    weekJumpPending.current = false;
    setWeekStart(getNextSunday(new Date()));
    window.history.replaceState({}, "", window.location.pathname + stripWeekParam(window.location.search));
  }, []);

  // ── Persist to localStorage + Supabase ─────────────────
  // Debounced per key: rapid edits (e.g. filling several cells) collapse into
  // one upsert of the latest value instead of a full upload per keystroke.
  const syncToSupabase = useCallback((key: string, value: unknown) => {
    if (!isSupabaseConfigured || isRemoteUpdate.current || !profile?.org_id || !hasLoaded.current) return;
    setSyncStatus("syncing");
    clearTimeout(syncTimers.current[key]);
    syncTimers.current[key] = setTimeout(() => {
      delete syncTimers.current[key];
      supabase!.from("app_store")
        .upsert({ key, org_id: profile.org_id, value, updated_at: new Date().toISOString() })
        .then(({ error }) => setSyncStatus(error ? "error" : "synced"));
    }, 500);
  }, [profile?.org_id]);

  // עדכוני זמינות שהוגשו על ידי עובדים (דרך הקישור האישי) - ממוזגים אוטומטית
  // ל-unavailableDays בכל טעינת האפליקציה, ואז נמחקים מתיבת-הדואר-הנכנס
  // (כדי שלא ימוזגו שוב וידרסו עריכה ידנית עתידית של המנהל).
  const applyAvailabilitySubmissions = useCallback(async (
    currentEmployees: Employee[], weekStart: Date, activeDays: number[],
  ) => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    const weekStartIso = toISODateLocal(weekStart);
    const { data: submissions, error } = await supabase!
      .from("employee_availability")
      .select("employee_id, unavailable_dates")
      .eq("org_id", profile.org_id)
      .eq("week_start", weekStartIso);
    if (error) {
      console.error("קריאת הגשות הזמינות נכשלה:", error);
      return;
    }
    if (!submissions || submissions.length === 0) return;
    const merged = mergeAvailabilitySubmissions(
      currentEmployees,
      submissions.map(s => ({ employeeId: s.employee_id as string, unavailableDates: s.unavailable_dates as string[] })),
      weekStart, activeDays,
    );
    setEmployees(merged);
    // כתיבה ישירה ל-app_store (לא דרך syncToSupabase המדגם) - צריך לדעת מיד
    // אם ההצלחה קרתה כדי להחליט אם למחוק את השורות שמוזגו. ה-effect הרגיל של
    // employees עדיין ירוץ ויכתוב שוב את אותו ערך - כפילות לא-מזיקה, לא נמנעת
    // בכוונה כדי לא לסבך את ה-isRemoteUpdate guard הקיים.
    const { error: saveError } = await supabase!.from("app_store")
      .upsert({ key: "employees", org_id: profile.org_id, value: merged, updated_at: new Date().toISOString() });
    if (saveError) { setSyncStatus("error"); return; }
    toast({ title: `הוחלו עדכוני זמינות מ-${submissions.length} עובדים` });
    const { error: deleteError } = await supabase!.from("employee_availability").delete()
      .eq("org_id", profile.org_id).eq("week_start", weekStartIso);
    if (deleteError) console.error("מחיקת הגשות הזמינות נכשלה:", deleteError);
  }, [profile?.org_id, toast]);

  // דיווחי היעדרות של הארגון - נטענים ונשמרים (לא נמחקים כמו תיבת-הזמינות).
  const loadAbsences = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    const { data, error } = await supabase!
      .from("absence_reports")
      .select("employee_id, date, resolved_at")
      .eq("org_id", profile.org_id);
    if (error) { console.error("קריאת דיווחי ההיעדרות נכשלה:", error); return; }
    setAbsences((data ?? []).map(r => ({
      employeeId: r.employee_id as string,
      date: r.date as string,
      resolvedAt: (r.resolved_at as string | null) ?? null,
    })));
  }, [profile?.org_id]);

  useEffect(() => { localStorage.setItem("employees", JSON.stringify(employees)); syncToSupabase("employees", employees); }, [employees, syncToSupabase]);
  useEffect(() => { localStorage.setItem("stations", JSON.stringify(stations)); syncToSupabase("stations", stations); }, [stations, syncToSupabase]);
  useEffect(() => { if (schedule) { localStorage.setItem("schedule", JSON.stringify(schedule)); syncToSupabase("schedule", schedule); } }, [schedule, syncToSupabase]);
  useEffect(() => { localStorage.setItem("weekStart", weekStart.toISOString()); syncToSupabase("weekStart", weekStart.toISOString()); }, [weekStart, syncToSupabase]);
  useEffect(() => { localStorage.setItem("savedSchedules", JSON.stringify(savedSchedules)); syncToSupabase("savedSchedules", savedSchedules); }, [savedSchedules, syncToSupabase]);
  useEffect(() => { localStorage.setItem("lockedCells", JSON.stringify(Array.from(lockedCells))); syncToSupabase("lockedCells", Array.from(lockedCells)); }, [lockedCells, syncToSupabase]);
  useEffect(() => { localStorage.setItem("auditLog", JSON.stringify(auditLog)); syncToSupabase("auditLog", auditLog); }, [auditLog, syncToSupabase]);
  useEffect(() => { localStorage.setItem("scheduleTemplates", JSON.stringify(templates)); syncToSupabase("scheduleTemplates", templates); }, [templates, syncToSupabase]);
  useEffect(() => { localStorage.setItem("cellColors", String(cellColors)); syncToSupabase("cellColors", cellColors); }, [cellColors, syncToSupabase]);
  useEffect(() => { localStorage.setItem("activeDays", JSON.stringify(activeDays)); syncToSupabase("activeDays", activeDays); }, [activeDays, syncToSupabase]);
  useEffect(() => { localStorage.setItem("employeeView", String(employeeView)); syncToSupabase("employeeView", employeeView); }, [employeeView, syncToSupabase]);

  // ── Load from Supabase on mount ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    supabase!.from("app_store").select("key, value").eq("org_id", profile.org_id).then(({ data, error }) => {
      if (error || !data) { setSyncStatus("error"); return; }
      isRemoteUpdate.current = true;
      const store = Object.fromEntries(data.map(r => [r.key, r.value]));
      let resolvedWeekStart = getNextSunday(new Date());
      let resolvedActiveDays = DEFAULT_ACTIVE_DAYS;
      if (data.length === 0) {
        ORG_DATA_KEYS.forEach(k => localStorage.removeItem(k));
        setEmployees([]); setStations([]); setSchedule(null);
        setSavedSchedules([]); setTemplates([]); setLockedCells(new Set()); setAuditLog({});
        setCellColors(true);
        setEmployeeView(false);
        setActiveDays(DEFAULT_ACTIVE_DAYS);
        setWeekStart(getNextSunday(new Date()));
      } else {
        if (store.employees)      setEmployees(store.employees as Employee[]);
        if (store.stations)       setStations(store.stations as Station[]);
        if (store.schedule)       setSchedule(store.schedule as WeeklySchedule);
        if (store.weekStart) {
          const ws = new Date(store.weekStart as string);
          const weekEnd = new Date(ws);
          weekEnd.setDate(weekEnd.getDate() + 6);
          resolvedWeekStart = weekEnd < new Date() ? getNextSunday(new Date()) : ws;
          setWeekStart(resolvedWeekStart);
        }
        if (store.savedSchedules) setSavedSchedules(store.savedSchedules as SavedSchedule[]);
        if (store.scheduleTemplates) setTemplates(store.scheduleTemplates as ScheduleTemplate[]);
        if (store.lockedCells)    setLockedCells(new Set(store.lockedCells as string[]));
        if (store.auditLog)       setAuditLog(store.auditLog as { [k: string]: AuditEntry[] });
        if (store.cellColors !== undefined) setCellColors(store.cellColors as boolean);
        if (store.activeDays) { resolvedActiveDays = store.activeDays as number[]; setActiveDays(resolvedActiveDays); }
        if (store.employeeView !== undefined) setEmployeeView(store.employeeView as boolean);
      }
      hasLoaded.current = true;
      setTimeout(() => {
        isRemoteUpdate.current = false;
        setSyncStatus("synced");
        applyPendingWeekJump();
        if (data.length > 0 && store.employees) {
          applyAvailabilitySubmissions(store.employees as Employee[], resolvedWeekStart, resolvedActiveDays);
        }
        loadAbsences();
      }, 200);
    });
  }, [profile?.org_id, applyAvailabilitySubmissions, loadAbsences, applyPendingWeekJump]);

  // ── מסלול מקומי (בלי Supabase) - קפיצת ?week=next רצה פעם אחת עם העלייה ──
  useEffect(() => {
    if (!isSupabaseConfigured) applyPendingWeekJump();
  }, [applyPendingWeekJump]);

  // ── מנוי realtime לדיווחי היעדרות ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id || !supabase) return;
    const channel = supabase
      .channel(`absence-${profile.org_id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "absence_reports", filter: `org_id=eq.${profile.org_id}` },
        () => loadAbsences())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [profile?.org_id, loadAbsences]);

  // ── Real-time subscription ─────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    const channel = supabase!
      .channel("app_store_realtime")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "app_store",
        filter: `org_id=eq.${profile.org_id}`,
      }, ({ new: row }) => {
        if (!row || !("key" in (row as object))) return;
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
        else if (key === "cellColors") setCellColors(value as boolean);
        else if (key === "activeDays") setActiveDays(value as number[]);
        else if (key === "employeeView") setEmployeeView(value as boolean);
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
  // Schedule cells store employee names, so a rename must propagate to every
  // schedule copy (current, archive, templates) or the cells become orphans.
  const renameInSchedule = (sched: WeeklySchedule, from: string, to: string): WeeklySchedule =>
    Object.fromEntries(Object.entries(sched).map(([date, day]) => [
      date,
      Object.fromEntries(Object.entries(day).map(([stId, cell]) => [
        stId,
        cellNames(cell).map(n => (n === from ? to : n)),
      ])),
    ]));

  const handleSaveEmployee = (data: Omit<Employee, "id"> & { id?: string }) => {
    // The name is the employee's identity across the whole app (schedule cells,
    // workloads, colors) - duplicates would merge two people into one.
    const name = data.name.trim();
    if (!name) {
      toast({ title: "שגיאה", description: "יש להזין שם עובד", variant: "destructive" });
      return;
    }
    if (employees.some(e => e.id !== data.id && e.name === name)) {
      toast({ title: "שם כפול", description: `כבר קיים עובד בשם "${name}" - בחר שם אחר`, variant: "destructive" });
      return;
    }
    if (!data.id && isOverEmployeeQuota(plan, employees.length)) {
      setUpgradeReason(`התוכנית החינמית מוגבלת ל-${FREE_EMPLOYEE_LIMIT} עובדים.`);
      return;
    }
    data = { ...data, name };
    if (data.id) {
      const oldName = employees.find(e => e.id === data.id)?.name;
      setEmployees(prev => prev.map(e => e.id === data.id ? { ...e, ...data } as Employee : e));
      if (oldName && oldName !== data.name) {
        setSchedule(prev => prev ? renameInSchedule(prev, oldName, data.name) : prev);
        setSavedSchedules(prev => prev.map(s => ({ ...s, schedule: renameInSchedule(s.schedule, oldName, data.name) })));
        setTemplates(prev => prev.map(t => ({ ...t, schedule: renameInSchedule(t.schedule, oldName, data.name) })));
      }
      toast({ title: "העובד עודכן" });
    } else {
      setEmployees(prev => [...prev, { ...data, id: Date.now().toString() }]);
      toast({ title: "העובד נוסף" });
    }
    setShowEmployeeForm(false);
    setEditingEmployee(null);
  };

  const handleDeleteEmployee = (id: string) => {
    const emp = employees.find(e => e.id === id);
    setEmployees(prev => prev.filter(e => e.id !== id));
    // Clear the employee's cells in the current schedule; archive and templates
    // are historical records and keep the name.
    if (emp) setSchedule(prev => prev ? renameInSchedule(prev, emp.name, "") : prev);
    // ביטול קישור הצפייה של העובד (אם יש) - לא חוסם, כשל מדווח
    if (isSupabaseConfigured && profile?.org_id) {
      supabase!.from("share_tokens").delete()
        .eq("org_id", profile.org_id).eq("employee_id", id)
        .then(({ error }) => {
          if (error) {
            console.error("מחיקת קישור הצפייה נכשלה:", error);
            toast({ title: "מחיקת קישור הצפייה של העובד נכשלה", variant: "destructive" });
          }
        });
      supabase!.from("employee_availability").delete()
        .eq("org_id", profile.org_id).eq("employee_id", id)
        .then(({ error }) => {
          if (error) console.error("מחיקת הגשת הזמינות של העובד נכשלה:", error);
        });
    }
    toast({ title: "העובד נמחק" });
  };

  const handleUpdateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  // ── Station handlers ───────────────────────────────────
  const handleAddStation = (name: string, requiredCount: number) => {
    if (isOverStationQuota(plan, stations.length)) {
      setUpgradeReason(`התוכנית החינמית מוגבלת ל-${FREE_STATION_LIMIT} עמדות.`);
      return;
    }
    if (requiredCount > 1 && !canUseMultiSlotStations(plan)) {
      setUpgradeReason("עמדה עם יותר מעובד אחד בו-זמנית זמינה בתוכנית Pro.");
      return;
    }
    const newId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    setStations(prev => [...prev, { id: newId, name, requiredCount }]);
    toast({ title: "העמדה נוספה" });
  };

  const handleEditStation = (id: number, name: string, requiredCount: number) => {
    const current = stations.find(s => s.id === id);
    if (requiredCount > 1 && (current?.requiredCount ?? 1) <= 1 && !canUseMultiSlotStations(plan)) {
      setUpgradeReason("עמדה עם יותר מעובד אחד בו-זמנית זמינה בתוכנית Pro.");
      return;
    }
    setStations(prev => prev.map(s => s.id === id ? { ...s, name, requiredCount } : s));
    toast({ title: "העמדה עודכנה" });
  };

  const [stationToDelete, setStationToDelete] = useState<Station | null>(null);

  const handleDeleteStation = (id: number) => {
    setStations(prev => prev.filter(s => s.id !== id));
    // Cascade: drop the station's cells, locks and audit entries, and remove it
    // from employees' station lists (unless it's their only station - then the
    // stale id is kept so the employee stays restricted and visibly needs fixing).
    setSchedule(prev => {
      if (!prev) return prev;
      return Object.fromEntries(Object.entries(prev).map(([date, day]) =>
        [date, Object.fromEntries(Object.entries(day).filter(([stId]) => Number(stId) !== id))]
      ));
    });
    const belongsToStation = (key: string) => key.split("__")[1] === String(id);
    setLockedCells(prev => new Set([...prev].filter(k => !belongsToStation(k))));
    setAuditLog(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !belongsToStation(k))));
    setEmployees(prev => prev.map(e => {
      const remaining = e.availableStations.filter(s => s !== id);
      return e.availableStations.includes(id) && remaining.length > 0
        ? { ...e, availableStations: remaining }
        : e;
    }));
    toast({ title: "העמדה נמחקה" });
  };

  // ── Generate schedule ──────────────────────────────────
  const doGenerate = (keepLocked: boolean) => {
    if (employees.length === 0 || stations.length === 0) {
      toast({ title: "שגיאה", description: "יש להוסיף עובדים ועמדות", variant: "destructive" });
      return;
    }
    if (schedule) setPreviousSchedule(schedule);

    // ניקוי אגבי: תאריכי העדפות שכבר עברו (לפני השבוע האמיתי הנוכחי) לא
    // ישפיעו על שום שיבוץ עתידי - בלי ניקוי הם נערמים על העובד לנצח.
    const todaySunday = getWeekDays(new Date(), [0])[0];
    setEmployees(prev => {
      let changed = false;
      const next = prev.map(e => {
        const unavailable = e.unavailableDays?.filter(d => d >= todaySunday);
        const requests = e.specificRequests?.filter(r => r.date >= todaySunday);
        const preferNot = e.preferNotDays?.filter(d => d >= todaySunday);
        if ((unavailable?.length ?? 0) === (e.unavailableDays?.length ?? 0) &&
            (requests?.length ?? 0) === (e.specificRequests?.length ?? 0) &&
            (preferNot?.length ?? 0) === (e.preferNotDays?.length ?? 0)) return e;
        changed = true;
        return { ...e, unavailableDays: unavailable, specificRequests: requests, preferNotDays: preferNot };
      });
      return changed ? next : prev;
    });

    let baseSchedule: WeeklySchedule | null = null;
    if (keepLocked && schedule) {
      // Start from current locked cells
      baseSchedule = {};
      const weekDays = getWeekDays(weekStart, activeDays);
      weekDays.forEach(date => {
        baseSchedule![date] = {};
        stations.forEach(st => {
          const names = cellNames(schedule[date]?.[st.id]);
          const arr: string[] = [];
          for (let i = 0; i < stationSlots(st); i++) {
            arr[i] = lockedCells.has(cellKey(date, st.id, i)) ? (names[i] ?? "") : "";
          }
          baseSchedule![date][st.id] = arr;
        });
      });
    }

    const newSchedule = generateWeeklySchedule(employees, stations, weekStart, activeDays, baseSchedule ?? undefined, lockedCells, savedSchedules);
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
    const currentDays = getWeekDays(weekStart, activeDays);
    const prevDays = getWeekDays(new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000), activeDays);

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
    const currentDays = getWeekDays(weekStart, activeDays);
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
        const existingNames = new Set(employees.map(e => e.name));
        let skippedDuplicates = 0;
        rows.slice(1).forEach(row => {
          const name = row[0]?.toString().trim();
          if (!name) return;
          if (existingNames.has(name)) { skippedDuplicates++; return; }
          existingNames.add(name);
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
        if (newEmployees.length > 0 && isOverEmployeeQuota(plan, employees.length + newEmployees.length - 1)) {
          setUpgradeReason(`הייבוא יביא את מספר העובדים מעבר למכסת ${FREE_EMPLOYEE_LIMIT} העובדים של התוכנית החינמית.`);
          return;
        }
        if (newEmployees.length > 0) {
          setEmployees(prev => [...prev, ...newEmployees]);
          toast({
            title: `יובאו ${newEmployees.length} עובדים`,
            description: skippedDuplicates > 0 ? `${skippedDuplicates} שורות דולגו - שם שכבר קיים` : undefined,
          });
        } else if (skippedDuplicates > 0) {
          toast({ title: "לא יובא אף עובד", description: `כל ${skippedDuplicates} השמות בקובץ כבר קיימים`, variant: "destructive" });
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
  const addAuditEntry = useCallback((date: string, stationId: number, slotIndex: number, from: string, to: string) => {
    const key = cellKey(date, stationId, slotIndex);
    const entry: AuditEntry = { from, to, timestamp: new Date().toISOString() };
    setAuditLog(prev => ({ ...prev, [key]: [...(prev[key] ?? []).slice(-19), entry] }));
  }, []);

  // ── Cell edit & lock ───────────────────────────────────
  const handleCellEdit = (date: string, stationId: number, slotIndex: number, employeeName: string) => {
    if (employeeName && schedule) {
      const employee = employees.find(e => e.name === employeeName);
      // Block exceeding the employee's max shifts per day.
      const sameDayCount = stations.reduce((acc, st) =>
        acc + cellNames(schedule[date]?.[st.id]).filter((n, i) =>
          n === employeeName && !(st.id === stationId && i === slotIndex)
        ).length, 0);
      const cap = employee ? dailyShiftCap(employee) : 1;
      if (sameDayCount >= cap) {
        toast({ title: "מקסימום שיבוצים ביום", description: `${employeeName} כבר עם ${sameDayCount} שיבוצים ביום זה (מקסימום: ${cap})`, variant: "destructive" });
        return;
      }
      if (employee?.maxWeeklyShifts != null) {
        const weekDays = getWeekDays(weekStart, activeDays);
        const currentShifts = weekDays.filter(
          d => d !== date && stations.some(st => cellNames(schedule[d]?.[st.id]).includes(employeeName))
        ).length;
        if (currentShifts + 1 > employee.maxWeeklyShifts) {
          toast({ title: "חריגה ממקסימום משמרות", description: `${employeeName} כבר עם ${currentShifts} משמרות (מקסימום: ${employee.maxWeeklyShifts})`, variant: "destructive" });
          return;
        }
      }
    }

    const currentValue = cellNames(schedule?.[date]?.[stationId])[slotIndex] ?? "";
    addAuditEntry(date, stationId, slotIndex, currentValue, employeeName);
    setSchedule(prev => {
      if (!prev) return prev;
      pushHistory(prev);
      const arr = [...cellNames(prev[date]?.[stationId])];
      while (arr.length <= slotIndex) arr.push("");
      arr[slotIndex] = employeeName;
      return { ...prev, [date]: { ...prev[date], [stationId]: arr } };
    });
  };

  const handleSwapCells = (date1: string, stationId1: number, slot1: number, date2: string, stationId2: number, slot2: number) => {
    if (!schedule) return;
    const name1 = cellNames(schedule[date1]?.[stationId1])[slot1] ?? "";
    const name2 = cellNames(schedule[date2]?.[stationId2])[slot2] ?? "";

    // A swap never adds work days, but it can land someone twice on the same
    // day - enforce the daily cap for each name that moves to a new date.
    const violatesDailyCap = (name: string, targetDate: string, sourceDate: string): boolean => {
      if (!name || targetDate === sourceDate) return false;
      const employee = employees.find(e => e.name === name);
      const cap = employee ? dailyShiftCap(employee) : 1;
      const count = stations.reduce((acc, st) =>
        acc + cellNames(schedule[targetDate]?.[st.id]).filter((n, i) =>
          n === name &&
          !(targetDate === date1 && st.id === stationId1 && i === slot1) &&
          !(targetDate === date2 && st.id === stationId2 && i === slot2)
        ).length, 0);
      return count + 1 > cap;
    };
    if (violatesDailyCap(name1, date2, date1) || violatesDailyCap(name2, date1, date2)) {
      const who = violatesDailyCap(name1, date2, date1) ? name1 : name2;
      toast({ title: "ההחלפה חורגת ממקסימום שיבוצים ביום", description: `${who} כבר משובץ ביום זה`, variant: "destructive" });
      return;
    }

    addAuditEntry(date1, stationId1, slot1, name1, name2);
    addAuditEntry(date2, stationId2, slot2, name2, name1);
    setSchedule(prev => {
      if (!prev) return prev;
      pushHistory(prev);
      const setSlot = (sched: WeeklySchedule, date: string, sid: number, slot: number, val: string) => {
        const arr = [...cellNames(sched[date]?.[sid])];
        while (arr.length <= slot) arr.push("");
        arr[slot] = val;
        return { ...sched[date], [sid]: arr };
      };
      let next = { ...prev, [date1]: setSlot(prev, date1, stationId1, slot1, name2) };
      next = { ...next, [date2]: setSlot(next, date2, stationId2, slot2, name1) };
      return next;
    });
  };

  const handleToggleLock = (date: string, stationId: number, slotIndex: number) => {
    const key = cellKey(date, stationId, slotIndex);
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
    const hebrewDays = getHebrewDayLabels(activeDays);
    const weekDays = getWeekDays(weekStart, activeDays);
    const headers = ["עמדה", ...hebrewDays.map((day, idx) =>
      `${day} (${parseISODate(weekDays[idx]).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})`
    )];
    const data = stations.map(station => [
      station.name,
      ...weekDays.map(date => cellNames(schedule[date]?.[station.id]).filter(Boolean).join(", ") || "לא משובץ"),
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
    const days = getWeekDays(weekStart, activeDays);
    return employees.map(emp => {
      const shifts = days.filter(d =>
        stations.some(st => cellNames(schedule[d]?.[st.id]).includes(emp.name))
      ).length;
      return { emp, shifts };
    });
  }, [schedule, employees, weekStart, activeDays, stations]);

  const underScheduled = workloadData.filter(w => w.shifts < w.emp.minWeeklyShifts);

  const emptySlots = useMemo(() => {
    if (!schedule) return 0;
    return Object.values(schedule).reduce(
      (count, day) => count + Object.values(day).reduce((a, cell) => a + cellNames(cell).filter(v => !v).length, 0), 0
    );
  }, [schedule]);

  // ── דיווחי היעדרות לשבוע המפורסם (מה שהעובד רואה) + סט מפתחות לסימון בטבלה ──
  const weekAbsences = useMemo(
    () => publishedPayload
      ? absencesForWeek(absences, employees, getWeekDays(parseISODate(publishedPayload.weekStart), publishedPayload.activeDays))
      : [],
    [absences, employees, publishedPayload],
  );
  const absentKeys = useMemo(() => absentKeySet(absences, employees), [absences, employees]);

  const handleResolveAbsence = async (employeeId: string, date: string) => {
    if (!supabase || !profile?.org_id) return;
    const { error } = await supabase.from("absence_reports")
      .update({ resolved_at: new Date().toISOString() })
      .eq("org_id", profile.org_id).eq("employee_id", employeeId).eq("date", date);
    if (error) {
      console.error("סימון הטיפול נכשל:", error);
      toast({ title: "שגיאה בסימון הטיפול", variant: "destructive" });
      return;
    }
    setAbsences(prev => prev.map(a =>
      a.employeeId === employeeId && a.date === date
        ? { ...a, resolvedAt: new Date().toISOString() }
        : a));
  };

  // אזהרה לפני פעולות "כלפי חוץ" כשיש משבצות ריקות - הפעולה נשמרת ורצה רק אחרי אישור
  const [pendingExportAction, setPendingExportAction] = useState<"publish" | "png" | "excel" | null>(null);

  const exportActions = {
    publish: handlePublish,
    png:     handleExportToImage,
    excel:   handleExportToExcel,
  } as const;

  const guardEmptySlots = (action: "publish" | "png" | "excel") => {
    if (schedule && emptySlots > 0) setPendingExportAction(action);
    else exportActions[action]();
  };

  // ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-border glass print:hidden">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="לוגו" className="w-8 h-8 rounded-lg shrink-0" />
            <div>
              <span className="text-lg font-extrabold text-foreground leading-tight">שיבוץ</span>
              <p className="text-xs text-muted-foreground">ניהול שיבוצים חכם</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Org chip */}
            {isSupabaseConfigured && org && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                <span className="text-xs font-medium text-foreground">{org.name}</span>
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
            {!isSupabaseConfigured && (
              <div title="נתונים מקומיים בלבד">
                <CloudOff className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}

            {isSupabaseConfigured && profile?.org_id && (
              <Button variant="ghost" size="icon" onClick={() => setTeamDialogOpen(true)}
                title="ניהול מנהלים" className="rounded-xl hover:bg-primary/10">
                <UserPlus className="h-5 w-5" />
              </Button>
            )}

            <HelpDialog />

            <ContactDeveloper />

            <AboutDialog />

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

      <main className="container mx-auto px-4 py-6 space-y-6">
        <GuidesBanner />
        <Tabs defaultValue="schedule" className="space-y-6">
          <TabsList className="h-auto bg-transparent p-0 gap-7 justify-start rounded-none border-b border-border print:hidden">
            <TabsTrigger value="stations" className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0 py-2.5 text-sm font-medium transition-all">
              <span className="index-num">01</span> עמדות והגדרות
            </TabsTrigger>
            <TabsTrigger value="employees" className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0 py-2.5 text-sm font-medium transition-all">
              <span className="index-num">02</span> עובדים
            </TabsTrigger>
            <TabsTrigger value="preferences" className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0 py-2.5 text-sm font-medium transition-all">
              <span className="index-num">03</span> העדפות
            </TabsTrigger>
            <TabsTrigger value="schedule" className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0 py-2.5 text-sm font-medium transition-all">
              <span className="index-num">04</span> שיבוץ
            </TabsTrigger>
            <TabsTrigger value="reports" className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0 py-2.5 text-sm font-medium transition-all">
              <span className="index-num">05</span> דוחות
            </TabsTrigger>
          </TabsList>

          {/* ── Stations ── */}
          <TabsContent value="stations" className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <MapPin className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-extrabold">ניהול עמדות</h2>
            </div>
            <Card className="p-4 space-y-3">
              <div>
                <h3 className="font-semibold">ימי עבודה</h3>
                <p className="text-sm text-muted-foreground">בחר אילו ימים נחשבים שבוע עבודה (ברירת מחדל: ראשון - חמישי)</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {ALL_HEBREW_DAYS.map((label, idx) => {
                  const checked = activeDays.includes(idx);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <Checkbox
                        id={`workday-${idx}`}
                        checked={checked}
                        onCheckedChange={() => {
                          setActiveDays(prev => {
                            const next = prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx];
                            return next.length === 0 ? prev : next.sort((a, b) => a - b);
                          });
                        }}
                      />
                      <Label htmlFor={`workday-${idx}`} className="text-sm cursor-pointer">{label}</Label>
                    </div>
                  );
                })}
              </div>
            </Card>
            <StationManager stations={stations} onAdd={handleAddStation} onEdit={handleEditStation}
              onDelete={id => setStationToDelete(stations.find(s => s.id === id) ?? null)} />
          </TabsContent>

          {/* ── Employees ── */}
          <TabsContent value="employees" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-extrabold">ניהול עובדים</h2>
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
                activeDays={activeDays}
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
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Calendar className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-extrabold">העדפות שבועיות</h2>
            </div>
            <WeeklyPreferences
              employees={employees}
              stations={stations}
              weekStart={weekStart}
              activeDays={activeDays}
              onUpdate={handleUpdateEmployee}
            />
          </TabsContent>

          {/* ── Schedule ── */}
          <TabsContent value="schedule" className="space-y-4">
            {/* Masthead */}
            <div className="flex items-end justify-between gap-6 flex-wrap pt-2">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="w-6 h-0.5 bg-primary" />
                  <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">
                    מהדורה שבועית · גיליון {getWeekNumber(weekStart)}
                  </span>
                </div>
                <h1 className="masthead-title text-4xl sm:text-5xl text-foreground">שיבוץ שבועי</h1>
                <p className="text-muted-foreground mt-2 font-medium">
                  {formatWeekRange(weekStart, activeDays)}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{employees.length} עובדים</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{stations.length} עמדות</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div />
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

                {/* Publish + share */}
                {isSupabaseConfigured && schedule && (
                  <Button variant={unpublishedChanges ? "default" : "outline"} onClick={() => guardEmptySlots("publish")}
                    title={publishedAt ? `פורסם לאחרונה: ${new Date(publishedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "טרם פורסם"}>
                    <Megaphone className="h-4 w-4 ml-2" />
                    <span className="hidden sm:inline">פרסם לצוות</span>
                    {unpublishedChanges && publishedAt && <span className="mr-1.5 w-2 h-2 rounded-full bg-warning inline-block" />}
                  </Button>
                )}
                {isSupabaseConfigured && (
                  <Button variant="outline" onClick={() => setShareDialogOpen(true)} title="קישורי צפייה לעובדים">
                    <Share2 className="h-4 w-4 ml-2" />
                    <span className="hidden sm:inline">שיתוף</span>
                  </Button>
                )}

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
            <Card className="border-primary/20 bg-primary/5 overflow-hidden">
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
                {/* Editorial status line */}
                <div className="flex items-center gap-2.5 py-3 border-y border-border text-sm font-medium flex-wrap">
                  {underScheduled.length === 0 && emptySlots === 0 ? (
                    <><span className="w-2 h-2 rounded-full bg-success shrink-0" />השיבוץ מלא - כל העובדים קיבלו את מינימום המשמרות</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                      {emptySlots > 0 && <span className="text-foreground">{emptySlots} משבצות ריקות</span>}
                      {underScheduled.length > 0 && <span className="text-muted-foreground">· מתחת למינימום: {underScheduled.map(w => `${w.emp.name} (${w.shifts}/${w.emp.minWeeklyShifts})`).join(", ")}</span>}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-end">
                  <div className="flex items-center gap-2">
                    <Switch id="employee-view" checked={employeeView} onCheckedChange={setEmployeeView} />
                    <Label htmlFor="employee-view" className="text-sm cursor-pointer text-muted-foreground">תצוגה לפי עובדים</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="cell-colors" checked={cellColors} onCheckedChange={setCellColors} />
                    <Label htmlFor="cell-colors" className="text-sm cursor-pointer text-muted-foreground">צבע לעובד</Label>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => guardEmptySlots("png")}>
                    <Image className="h-4 w-4 ml-1" /> PNG
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => guardEmptySlots("excel")}>
                    <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel
                  </Button>
                </div>

                {weekAbsences.length > 0 && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1.5 print:hidden">
                    <p className="text-sm font-bold text-destructive flex items-center gap-1.5">
                      <Thermometer className="h-4 w-4" /> דיווחי היעדרות לשבוע זה
                    </p>
                    {weekAbsences.map(a => (
                      <div key={`${a.employeeId}-${a.date}`} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {a.employeeName} - {parseISODate(a.date).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" })}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleResolveAbsence(a.employeeId, a.date)}>
                          טופל
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div id="schedule-table">
                  {employeeView ? (
                    <EmployeeScheduleView
                      employees={employees}
                      stations={stations}
                      schedule={schedule}
                      weekStart={weekStart}
                      activeDays={activeDays}
                      darkMode={darkMode}
                    />
                  ) : (
                    <ScheduleTable
                      schedule={schedule}
                      stations={stations}
                      employees={employees}
                      weekStart={weekStart}
                      activeDays={activeDays}
                      lockedCells={lockedCells}
                      auditLog={auditLog}
                      onCellEdit={handleCellEdit}
                      onSwapCells={handleSwapCells}
                      onToggleLock={handleToggleLock}
                      cellColors={cellColors}
                      darkMode={darkMode}
                      absentKeys={absentKeys}
                    />
                  )}
                </div>

                {/* Workload - slim */}
                <div>
                  <p className="text-xs tracking-widest uppercase text-muted-foreground font-bold mb-4">עומס עובדים השבוע</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {workloadData.map(({ emp, shifts }) => {
                      const max = emp.maxWeeklyShifts ?? 5;
                      const pct = Math.min((shifts / Math.max(max, 1)) * 100, 100);
                      const isUnder = shifts < emp.minWeeklyShifts;
                      const isOver = emp.maxWeeklyShifts != null && shifts > emp.maxWeeklyShifts;
                      const barColor = isOver ? "bg-destructive" : isUnder ? "bg-warning" : "bg-success";
                      return (
                        <div key={emp.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium truncate max-w-[80px]" title={emp.name}>{emp.name}</span>
                            <span className={`text-xs font-bold ${isOver ? "text-destructive" : isUnder ? "text-warning" : "text-success"}`}>
                              {shifts}/{emp.maxWeeklyShifts ?? "∞"}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-xs text-muted-foreground">מינ׳ {emp.minWeeklyShifts}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg bg-accent/20">
                  <Switch id="show-changes" checked={showChanges} onCheckedChange={setShowChanges} />
                  <Label htmlFor="show-changes" className="cursor-pointer flex items-center gap-2">
                    {showChanges ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    שינויים מהגרסה הקודמת
                  </Label>
                </div>

                {showChanges && (
                  <ScheduleChanges
                    currentSchedule={schedule}
                    previousSchedule={previousSchedule}
                    stations={stations}
                    currentWeekStart={weekStart}
                    activeDays={activeDays}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-16 bg-primary/5 border-2 border-dashed border-border rounded-2xl">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8" />
                </div>
                <p className="text-lg font-semibold mb-1">אין שיבוץ פעיל</p>
                <p className="text-muted-foreground text-sm mb-5">לחץ על "צור שיבוץ" ליצירת טבלת שיבוץ שבועית</p>
                <Button onClick={handleGenerateSchedule} className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
            <div className="flex items-center gap-3 print:hidden">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <BarChart2 className="h-4 w-4" />
              </div>
              <h2 className="text-xl font-extrabold">דוחות לחשבות</h2>
            </div>
            {canUseMonthlyReports(plan) ? (
              <MonthlyReport savedSchedules={savedSchedules} stations={stations} absences={absences} employees={employees} />
            ) : (
              <div className="text-center py-16 bg-primary/5 border-2 border-dashed border-border rounded-2xl">
                <p className="text-lg font-semibold mb-1">דוחות חודשיים - תוכנית Pro</p>
                <p className="text-muted-foreground text-sm">
                  דוחות שכר חודשיים, דוחות עמדות וגרפים היסטוריים זמינים בתוכנית Pro.
                  פנו אלינו דרך "צור קשר עם המפתח" שבכותרת.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Upgrade (freemium) dialog */}
      <UpgradeDialog reason={upgradeReason} onClose={() => setUpgradeReason(null)} />

      {/* Share links dialog */}
      {isSupabaseConfigured && profile?.org_id && (
        <ShareLinksDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          employees={employees}
          orgId={profile.org_id}
        />
      )}

      {/* Team management dialog */}
      {isSupabaseConfigured && profile?.org_id && (
        <TeamDialog
          open={teamDialogOpen}
          onOpenChange={setTeamDialogOpen}
          orgId={profile.org_id}
        />
      )}

      {/* Station delete confirmation */}
      <AlertDialog open={stationToDelete !== null} onOpenChange={open => { if (!open) setStationToDelete(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את העמדה "{stationToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              המחיקה תסיר גם את השיבוצים, הנעילות והיסטוריית השינויים של העמדה בשבוע הנוכחי, ואת העמדה מרשימת העמדות של העובדים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (stationToDelete) handleDeleteStation(stationToDelete.id); setStationToDelete(null); }}
            >
              מחק עמדה
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty slots warning before publish/export */}
      <AlertDialog open={pendingExportAction !== null} onOpenChange={open => { if (!open) setPendingExportAction(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>יש {emptySlots} משבצות ריקות בשיבוץ</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingExportAction === "publish"
                ? "השיבוץ יפורסם לצוות עם המשבצות הריקות. להמשיך?"
                : "הקובץ ייווצא עם המשבצות הריקות. להמשיך?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => { if (pendingExportAction) exportActions[pendingExportAction](); setPendingExportAction(null); }}
            >
              המשך בכל זאת
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
