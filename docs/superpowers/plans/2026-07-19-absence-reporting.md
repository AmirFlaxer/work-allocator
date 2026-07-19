# דיווח היעדרות / מחלה - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** עובד מדווח היעדרות/מחלה דרך הקישור האישי; המנהל מקבל מייל + באנר באפליקציה + סימון-אדום "דורש החלפה" בטבלה, והדוח החודשי סופר כמה ימי-מחלה דווחו.

**Architecture:** טבלת `absence_reports` + 2 RPC ציבוריים (דפוס הזמינות) + Edge Function `notify-absence` (דפוס notify-new-user). לוגיקה טהורה ב-`src/lib/absence.ts`, טופס בעמוד השיתוף, טעינה+realtime+באנר+סימון בצד המנהל, וספירה בדוח.

**Tech Stack:** React 18 + TS + Vite · Supabase (RLS + RPC + Edge Functions + Resend) · vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-absence-reporting-design.md`

## Global Constraints

- **עברית בלבד** בכל UI/הערות/מיילים. מקף רגיל ( - ), בלי חצים (→).
- **branch:** `feat/absence-reporting` בתיקיית הפרויקט הראשית (לא worktree). כל משימה נפתחת ב-`git branch --show-current` - עצור אם לא `feat/absence-reporting`.
- שערים לכל משימה: `npx tsc --noEmit && npm test && npm run lint` (בלי אזהרות חדשות מעל baseline 8). משימות UI גם `npm run build`.
- כל פונקציות SQL חדשות: `SECURITY DEFINER SET search_path = public`.
- הדוח **סופר בלבד** - לא מנכה ממשמרות, לא לוגיקת-שכר.
- `absence_reports` תפעולית - נמחקת ב"טופל"; לא ארכיון.
- קובצי ה-SQL וה-Edge Function הם מקור-אמת בלבד; ההחלה/פריסה היא משימת-אינטגרציה נפרדת (Task 9) של המתזמר.

---

### Task 1: קובץ SQL - טבלה + RPC

**Files:**
- Create: `supabase_absence.sql`

**Interfaces:**
- Produces (למשימות 3-7): טבלה `absence_reports(org_id, employee_id, date, reported_at)` · rpc `get_share_absence_context(share_token TEXT)` · rpc `submit_absence_report(share_token TEXT, week_dates JSONB, sick_dates JSONB)`.

- [ ] **Step 1: כתיבת הקובץ במלואו**

```sql
-- ════════════════════════════════════════════════════════
-- Absence Reports - דיווח היעדרות/מחלה (spec: 2026-07-19)
-- מקור-אמת. מוחל על ה-DB דרך Supabase MCP (apply_migration), לא ידנית.
-- דורש: organizations, share_tokens, published_schedules, app_store,
-- get_my_org_id() (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

-- דיווחי היעדרות - רשומה פר עובד-יום. תפעולי: מזין מייל/באנר/סימון/ספירה.
-- נמחק כשהמנהל מסמן "טופל" או כשהעובד מבטל סימון. לא ארכיון-שכר.
CREATE TABLE IF NOT EXISTS absence_reports (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  date        TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, employee_id, date)
);

ALTER TABLE absence_reports ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "absence_all" ON absence_reports;
CREATE POLICY "absence_all" ON absence_reports FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON absence_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON absence_reports TO service_role;

-- realtime - כדי שהבאנר אצל המנהל יופיע חי בלי רענון
ALTER PUBLICATION supabase_realtime ADD TABLE absence_reports;

-- הדלת הציבורית הראשונה: מחזירה לעובד את השבוע המפורסם + הימים שכבר דיווח עליהם.
-- מקור השבוע הוא published_schedules (מה שהעובד רואה מולו), לא app_store.weekStart.
CREATE OR REPLACE FUNCTION get_share_absence_context(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'weekStart',  p.payload -> 'weekStart',
    'activeDays', p.payload -> 'activeDays',
    'currentSickDates', COALESCE(
      (SELECT jsonb_agg(a.date)
       FROM absence_reports a
       WHERE a.org_id = t.org_id AND a.employee_id = t.employee_id),
      '[]'::jsonb)
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_share_absence_context(TEXT) TO anon, authenticated;

-- הדלת הציבורית השנייה: העובד שולח/מעדכן דיווחי-מחלה לשבוע המפורסם.
-- החלפה מלאה של פרוסת-השבוע (כמו הזמינות): מוחק ימים שהוסרו מ-week_dates,
-- מכניס את sick_dates (idempotent). דיווחים לשבועות אחרים לא נוגעים.
CREATE OR REPLACE FUNCTION submit_absence_report(share_token TEXT, week_dates JSONB, sick_dates JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_org TEXT;
  t_emp TEXT;
BEGIN
  SELECT org_id, employee_id INTO t_org, t_emp
  FROM share_tokens WHERE token = share_token;
  IF t_org IS NULL THEN RETURN; END IF;

  DELETE FROM absence_reports
   WHERE org_id = t_org AND employee_id = t_emp
     AND date IN (SELECT jsonb_array_elements_text(week_dates))
     AND date NOT IN (SELECT jsonb_array_elements_text(sick_dates));

  INSERT INTO absence_reports (org_id, employee_id, date)
  SELECT t_org, t_emp, d
  FROM jsonb_array_elements_text(sick_dates) AS d
  ON CONFLICT (org_id, employee_id, date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_absence_report(TEXT, JSONB, JSONB) TO anon, authenticated;
```

- [ ] **Step 2: אימות סטטי** - `npx tsc --noEmit && npm test` (הקובץ לא נוגע ב-TS; בדיקת-שפיות שלא נשבר דבר). Expected: 80/80 ירוק.

- [ ] **Step 3: Commit**

```bash
git add supabase_absence.sql
git commit -m "feat: supabase_absence.sql - טבלת היעדרויות + RPC דיווח/הקשר"
```

---

### Task 2: לוגיקה טהורה `src/lib/absence.ts` + שער Pro (TDD)

**Files:**
- Create: `src/lib/absence.ts`, `src/lib/absence.test.ts`
- Modify: `src/lib/plan.ts` (הוספה בסוף), `src/lib/plan.test.ts` (בדיקה)

**Interfaces:**
- Produces (למשימות 3-6): `ShareAbsenceContext { weekStart: string; activeDays: number[]; currentSickDates: string[] }` · `AbsenceRecord { employeeId: string; date: string }` · `absenceKey(date: string, employeeName: string): string` · `absentKeySet(absences: AbsenceRecord[], employees: { id: string; name: string }[]): Set<string>` · `absencesForWeek(absences: AbsenceRecord[], employees: { id: string; name: string }[], weekDays: string[]): { employeeName: string; date: string }[]` · `buildSickCounts(absences: AbsenceRecord[], employees: { id: string; name: string }[], month: number, year: number): Record<string, number>` · `canUseAbsenceReporting(): boolean`.

- [ ] **Step 1: בדיקות נכשלות** - `src/lib/absence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { absenceKey, absentKeySet, absencesForWeek, buildSickCounts, AbsenceRecord } from "./absence";

const employees = [{ id: "a", name: "אבי" }, { id: "b", name: "בני" }];

describe("absenceKey", () => {
  it("בונה מפתח מתאריך ושם", () => {
    expect(absenceKey("2026-07-23", "אבי")).toBe("2026-07-23|אבי");
  });
});

describe("absentKeySet", () => {
  it("ממפה employee_id לשם ובונה מפתחות תאריך+שם", () => {
    const absences: AbsenceRecord[] = [{ employeeId: "a", date: "2026-07-23" }];
    const set = absentKeySet(absences, employees);
    expect(set.has("2026-07-23|אבי")).toBe(true);
    expect(set.has("2026-07-23|בני")).toBe(false);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    const set = absentKeySet([{ employeeId: "x", date: "2026-07-23" }], employees);
    expect(set.size).toBe(0);
  });
});

describe("absencesForWeek", () => {
  it("מחזיר רק היעדרויות שתאריכן בימי השבוע, עם שם העובד", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-23" },
      { employeeId: "b", date: "2026-08-01" },
    ];
    const result = absencesForWeek(absences, employees, ["2026-07-22", "2026-07-23"]);
    expect(result).toEqual([{ employeeName: "אבי", date: "2026-07-23" }]);
  });
});

describe("buildSickCounts", () => {
  it("סופר ימי-מחלה פר שם עובד לחודש/שנה נתונים (0-indexed month)", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-05" },
      { employeeId: "a", date: "2026-07-19" },
      { employeeId: "a", date: "2026-08-02" }, // חודש אחר
      { employeeId: "b", date: "2026-07-10" },
    ];
    const counts = buildSickCounts(absences, employees, 6, 2026); // יולי
    expect(counts["אבי"]).toBe(2);
    expect(counts["בני"]).toBe(1);
  });
  it("עובד בלי דיווחים לא מופיע", () => {
    expect(buildSickCounts([], employees, 6, 2026)).toEqual({});
  });
});
```

- [ ] **Step 2: לוודא כישלון** - `npm test -- absence` Expected: FAIL על import חסר.

- [ ] **Step 3: מימוש `src/lib/absence.ts`**

```ts
import { parseISODate } from "@/lib/week";

/** ההקשר שמחזיר get_share_absence_context לעמוד השיתוף. */
export interface ShareAbsenceContext {
  weekStart: string;         // YYYY-MM-DD מקומי (מ-published_schedules)
  activeDays: number[];
  currentSickDates: string[];
}

/** שורת היעדרות כפי שנטענת בצד המנהל (employee_id, לא שם). */
export interface AbsenceRecord {
  employeeId: string;
  date: string;              // YYYY-MM-DD
}

/** מפתח אחיד תאריך+שם לסימון תאים בטבלה. */
export function absenceKey(date: string, employeeName: string): string {
  return `${date}|${employeeName}`;
}

/** סט מפתחות תאריך+שם לכל ההיעדרויות (מיפוי employee_id לשם דרך employees). */
export function absentKeySet(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
): Set<string> {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const set = new Set<string>();
  absences.forEach(a => {
    const name = nameById.get(a.employeeId);
    if (name) set.add(absenceKey(a.date, name));
  });
  return set;
}

/** היעדרויות שתאריכן בימי השבוע הנתונים, עם שם העובד - לבאנר של המנהל. */
export function absencesForWeek(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
  weekDays: string[],
): { employeeName: string; date: string }[] {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const daySet = new Set(weekDays);
  return absences
    .filter(a => daySet.has(a.date) && nameById.has(a.employeeId))
    .map(a => ({ employeeName: nameById.get(a.employeeId)!, date: a.date }));
}

/** ספירת ימי-מחלה שדווחו פר שם עובד לחודש/שנה (month 0-indexed). ספירה בלבד. */
export function buildSickCounts(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
  month: number,
  year: number,
): Record<string, number> {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const counts: Record<string, number> = {};
  absences.forEach(a => {
    const name = nameById.get(a.employeeId);
    if (!name) return;
    const d = parseISODate(a.date);
    if (d.getMonth() !== month || d.getFullYear() !== year) return;
    counts[name] = (counts[name] ?? 0) + 1;
  });
  return counts;
}
```

- [ ] **Step 4: לוודא הצלחה** - `npm test -- absence` PASS, ואז `npx tsc --noEmit`.

- [ ] **Step 5: שער Pro** - להוסיף בסוף `src/lib/plan.ts`:

```ts
/**
 * דיווח היעדרות/מחלה ע"י העובד דרך הקישור האישי - פיצ'ר Pro. כמו
 * canUseAvailabilityInput: קריאה טהורה בלי plan (נקראת מעמוד השיתוף הציבורי).
 */
export function canUseAbsenceReporting(): boolean {
  return !ENFORCE_QUOTA;
}
```

ובדיקה ל-`src/lib/plan.test.ts` (לקרוא ולהתאים לסגנון הקיים, ולהוסיף `canUseAbsenceReporting` ל-import):

```ts
describe("canUseAbsenceReporting", () => {
  it("פתוח לכולם כשהאכיפה כבויה", () => {
    expect(canUseAbsenceReporting()).toBe(true);
  });
});
```

- [ ] **Step 6: שערים** - `npx tsc --noEmit && npm test && npm run lint`. Expected: ירוק, baseline 8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/absence.ts src/lib/absence.test.ts src/lib/plan.ts src/lib/plan.test.ts
git commit -m "feat: לוגיקת היעדרויות absence.ts + שער Pro, עם בדיקות"
```

---

### Task 3: טופס דיווח בעמוד השיתוף

**Files:**
- Create: `src/components/AbsenceForm.tsx`
- Modify: `src/pages/SharePage.tsx` (רינדור הטופס)

**Interfaces:**
- Consumes: `ShareAbsenceContext` (Task 2) · `canUseAbsenceReporting` (Task 2) · rpc `get_share_absence_context`, `submit_absence_report` (Task 1) · `getWeekDays`, `getHebrewDayLabels`, `parseISODate` (week.ts). דפוס: `src/components/AvailabilityForm.tsx`.

- [ ] **Step 1: יצירת `src/components/AbsenceForm.tsx`** (מבוסס במדויק על AvailabilityForm):

```tsx
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canUseAbsenceReporting } from "@/lib/plan";
import { ShareAbsenceContext } from "@/lib/absence";
import { getWeekDays, getHebrewDayLabels, parseISODate } from "@/lib/week";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Thermometer } from "lucide-react";

interface AbsenceFormProps {
  token: string;
}

type FormStatus = "loading" | "unavailable" | "ready" | "submitting" | "submitted" | "error";

interface FormState {
  status: FormStatus;
  context?: ShareAbsenceContext;
  selected?: Set<string>;
}

// טופס דיווח היעדרות/מחלה בעמוד השיתוף. עצמאי מבחינת טעינה (הקשר נפרד
// מ-get_shared_schedule). מקור השבוע: published_schedules (השבוע שהעובד רואה).
export function AbsenceForm({ token }: AbsenceFormProps) {
  const [state, setState] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured || !canUseAbsenceReporting()) { setState({ status: "unavailable" }); return; }
    supabase!.rpc("get_share_absence_context", { share_token: token }).then(({ data, error }) => {
      const context = data as ShareAbsenceContext | null;
      if (error || !context || !context.weekStart || !context.activeDays) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", context, selected: new Set(context.currentSickDates ?? []) });
    }, (err: unknown) => {
      console.error("טעינת הקשר ההיעדרות נכשלה:", err);
      setState({ status: "unavailable" });
    });
  }, [token]);

  if (state.status === "loading" || state.status === "unavailable") return null;

  const { context, selected } = state as Required<FormState>;
  const weekDays = getWeekDays(parseISODate(context.weekStart), context.activeDays);
  const hebrewDays = getHebrewDayLabels(context.activeDays);
  const submitting = state.status === "submitting";

  const toggle = (date: string) => {
    if (submitting) return;
    const next = new Set(selected);
    if (next.has(date)) next.delete(date); else next.add(date);
    setState({ status: "ready", context, selected: next });
  };

  const submit = () => {
    setState({ status: "submitting", context, selected });
    supabase!.rpc("submit_absence_report", {
      share_token: token,
      week_dates: weekDays,
      sick_dates: Array.from(selected),
    }).then(
      ({ error }) => setState({ status: error ? "error" : "submitted", context, selected }),
      (err: unknown) => {
        console.error("שליחת דיווח ההיעדרות נכשלה:", err);
        setState({ status: "error", context, selected });
      },
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Thermometer className="h-4 w-4 text-destructive" />
        <p className="text-sm font-bold">דיווח היעדרות / מחלה</p>
      </div>
      <p className="text-xs text-muted-foreground">סמן/י ימים בהם לא תוכל/י להגיע. הדיווח יישלח למנהל.</p>
      <div className="space-y-1.5">
        {weekDays.map((date, idx) => (
          <div key={date} className="flex items-center space-x-2 space-x-reverse">
            <Checkbox
              id={`absence-${date}`}
              checked={selected.has(date)}
              disabled={submitting}
              onCheckedChange={() => toggle(date)}
            />
            <Label htmlFor={`absence-${date}`} className="cursor-pointer text-sm">
              {hebrewDays[idx]}{" "}
              <span className="text-xs text-muted-foreground">
                ({parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})
              </span>
            </Label>
          </div>
        ))}
      </div>
      <Button size="sm" variant="destructive" onClick={submit} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח דיווח"}
      </Button>
      {state.status === "submitted" && <p className="text-xs text-primary font-medium">הדיווח נשלח, תודה. רפואה שלמה!</p>}
      {state.status === "error" && <p className="text-xs text-destructive font-medium">השליחה נכשלה, נסה/י שוב.</p>}
    </div>
  );
}
```

- [ ] **Step 2: חיווט ב-`src/pages/SharePage.tsx`** - import ורינדור מתחת ל-`<AvailabilityForm token={token!} />` (שורה ~90):

```tsx
        <AbsenceForm token={token!} />
```

(להוסיף `import { AbsenceForm } from "@/components/AbsenceForm";` לצד יבוא AvailabilityForm.)

- [ ] **Step 3: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build`. Expected: ירוק.

- [ ] **Step 4: Commit**

```bash
git add src/components/AbsenceForm.tsx src/pages/SharePage.tsx
git commit -m "feat: טופס דיווח היעדרות בעמוד השיתוף"
```

---

### Task 4: צד המנהל - טעינה, realtime ובאנר

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `AbsenceRecord`, `absencesForWeek`, `absentKeySet` (Task 2). דפוס טעינה: `applyAvailabilitySubmissions` (שורה ~293).
- Produces (למשימה 5): `absentKeys` (Set<string>) שיועבר ל-ScheduleTable; (למשימה 6): `absences` (AbsenceRecord[]) לדוח.

- [ ] **Step 1: state + טעינה**

1. import: `import { AbsenceRecord, absencesForWeek, absentKeySet } from "@/lib/absence";`
2. state (ליד שאר ה-useState, אחרי employees): `const [absences, setAbsences] = useState<AbsenceRecord[]>([]);`
3. callback טעינה (ליד `applyAvailabilitySubmissions`, ~שורה 325):

```tsx
  // דיווחי היעדרות של הארגון - נטענים ונשמרים (לא נמחקים כמו תיבת-הזמינות).
  const loadAbsences = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    const { data, error } = await supabase!
      .from("absence_reports")
      .select("employee_id, date")
      .eq("org_id", profile.org_id);
    if (error) { console.error("קריאת דיווחי ההיעדרות נכשלה:", error); return; }
    setAbsences((data ?? []).map(r => ({ employeeId: r.employee_id as string, date: r.date as string })));
  }, [profile?.org_id]);
```

4. קריאה ראשונית - בתוך ה-effect שטוען את ה-store (ליד הקריאה ל-`applyAvailabilitySubmissions`, ~שורה 380): להוסיף `loadAbsences();`. ולהוסיף `loadAbsences` ל-deps של אותו effect.

- [ ] **Step 2: realtime**

בתוך effect חדש (ליד המנוי הקיים ל-app_store, לחפש `.channel(`), מנוי על טבלת absence_reports שקורא `loadAbsences` בכל שינוי:

```tsx
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
```

- [ ] **Step 3: הבאנר**

חישוב היעדרויות השבוע (ליד חישובי ה-useMemo של הטבלה, למשל ליד `emptySlots`):

```tsx
  const weekAbsences = useMemo(
    () => absencesForWeek(absences, employees, getWeekDays(weekStart, activeDays)),
    [absences, employees, weekStart, activeDays],
  );
  const absentKeys = useMemo(() => absentKeySet(absences, employees), [absences, employees]);
```

מחיקת דיווח ("טופל"):

```tsx
  const handleResolveAbsence = async (employeeName: string, date: string) => {
    if (!supabase || !profile?.org_id) return;
    const emp = employees.find(e => e.name === employeeName);
    if (!emp) return;
    const { error } = await supabase.from("absence_reports").delete()
      .eq("org_id", profile.org_id).eq("employee_id", emp.id).eq("date", date);
    if (error) { toast({ title: "שגיאה בסימון הטיפול", variant: "destructive" }); return; }
    setAbsences(prev => prev.filter(a => !(a.employeeId === emp.id && a.date === date)));
  };
```

הבאנר עצמו - מעל מכל `#schedule-table` (~שורה 1323), מוצג רק כשיש היעדרויות לשבוע:

```tsx
                {weekAbsences.length > 0 && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1.5 print:hidden">
                    <p className="text-sm font-bold text-destructive flex items-center gap-1.5">
                      <Thermometer className="h-4 w-4" /> דיווחי היעדרות לשבוע זה
                    </p>
                    {weekAbsences.map(a => (
                      <div key={`${a.employeeName}-${a.date}`} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {a.employeeName} - {parseISODate(a.date).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" })}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleResolveAbsence(a.employeeName, a.date)}>
                          טופל
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
```

(לוודא ש-`Thermometer` מיובא מ-lucide-react בקובץ; `getWeekDays`, `parseISODate` כבר מיובאים.)

- [ ] **Step 4: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build`. Expected: ירוק, בלי אזהרות חדשות.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: טעינת דיווחי היעדרות + realtime + באנר אצל המנהל"
```

---

### Task 5: סימון "דורש החלפה" בטבלת השיבוץ

**Files:**
- Modify: `src/components/ScheduleTable.tsx` (prop חדש + סימון), `src/pages/Index.tsx` (העברת ה-prop)

**Interfaces:**
- Consumes: `absentKeys: Set<string>` (Task 4) · `absenceKey` (Task 2).

- [ ] **Step 1: prop ב-ScheduleTable**

1. import: `import { absenceKey } from "@/lib/absence";`
2. ל-`ScheduleTableProps` (שורה ~18) להוסיף: `absentKeys?: Set<string>;`
3. לחתימת הפונקציה (שורה ~44): להוסיף `absentKeys,` לפרמטרים.
4. בבלוק רינדור התא המאויש (ליד חישוב `softBroken`, ~שורה 178): להוסיף חישוב מקביל -

```tsx
                              const isAbsent = absentKeys?.has(absenceKey(date, name));
```

ומיד לפני ה-Badge של השם (לצד נקודת-ה-softBroken אם קיימת), להוסיף סימון אדום:

```tsx
                              {isAbsent && (
                                <span
                                  className="inline-block w-2 h-2 rounded-full bg-destructive shrink-0 animate-pulse"
                                  title="חולה - דורש החלפה"
                                />
                              )}
```

(אם `name`/`date` בסקופ המפה - כמו ב-softBroken; להתאים למיקום המדויק שבו softBroken כבר חושב.)

- [ ] **Step 2: העברת ה-prop ב-Index.tsx** - ל-`<ScheduleTable ... />` (שורה ~1334) להוסיף: `absentKeys={absentKeys}`.

- [ ] **Step 3: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build`. Expected: ירוק.

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleTable.tsx src/pages/Index.tsx
git commit -m "feat: סימון אדום דורש-החלפה בתא של עובד שדיווח היעדרות"
```

---

### Task 6: ספירת ימי-מחלה בדוח החודשי

**Files:**
- Modify: `src/components/MonthlyReport.tsx`, `src/pages/Index.tsx` (העברת absences)

**Interfaces:**
- Consumes: `buildSickCounts`, `AbsenceRecord` (Task 2) · `absences` (Task 4).

- [ ] **Step 1: prop ב-MonthlyReport**

1. import: `import { buildSickCounts, AbsenceRecord } from "@/lib/absence";`
2. ל-`MonthlyReportProps` (שורה ~14): להוסיף
   `absences?: AbsenceRecord[]; employees?: { id: string; name: string }[];`
3. בגוף הקומפוננטה, אחרי `report` (שורה ~135):

```tsx
  const sickCounts = useMemo(
    () => buildSickCounts(absences ?? [], employees ?? [], month, year),
    [absences, employees, month, year],
  );
```

4. בטבלת הדוח (ליד תצוגת `emp.totalShifts` לכל עובד): להוסיף תג "ימי מחלה" כשקיים ערך -

```tsx
                          {(sickCounts[emp.name] ?? 0) > 0 && (
                            <Badge variant="outline" className="border-destructive/40 text-destructive text-xs">
                              {sickCounts[emp.name]} ימי מחלה שדווחו
                            </Badge>
                          )}
```

(למקם ליד שאר התגים של העובד בשורת הדוח; לקרוא את מבנה השורה ולהתאים.)

5. **ייצוא Excel** (`handleExportExcel`, ~שורה 155): להוסיף עמודת "ימי מחלה שדווחו" לכל שורת-עובד עם `sickCounts[name] ?? 0`.

- [ ] **Step 2: העברת ה-props ב-Index.tsx** - ל-`<MonthlyReport ... />` (שורה ~1454) להוסיף:
  `absences={absences} employees={employees}`.

- [ ] **Step 3: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build`. Expected: ירוק.

- [ ] **Step 4: Commit**

```bash
git add src/components/MonthlyReport.tsx src/pages/Index.tsx
git commit -m "feat: ספירת ימי-מחלה שדווחו בדוח החודשי (בלי ניכוי)"
```

---

### Task 7: Edge Function `notify-absence`

**Files:**
- Create: `supabase/functions/notify-absence/index.ts`

**Interfaces:**
- Consumes: webhook payload `{ record: { org_id, employee_id, date } }` על INSERT ל-`absence_reports`. דפוס: `supabase/functions/notify-new-user/index.ts`.

- [ ] **Step 1: יצירת `supabase/functions/notify-absence/index.ts`**

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_NAME = "מחלק עבודה שבועי";

// קלט משתמש משורבב ל-HTML - חובה להבריח.
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record as { org_id: string; employee_id: string; date: string };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // מנהלי הארגון (כל מי שיש לו profile בארגון) + מייליהם
    const { data: admins } = await supabase
      .from("profiles").select("email").eq("org_id", record.org_id);
    const recipients = (admins ?? []).map(a => a.email).filter((e): e is string => !!e);
    if (recipients.length === 0) return new Response("no recipients", { status: 200 });

    // שם העובד מתוך app_store (key employees)
    const { data: empRow } = await supabase
      .from("app_store").select("value").eq("org_id", record.org_id).eq("key", "employees").maybeSingle();
    const employees = (empRow?.value as { id: string; name: string }[] | null) ?? [];
    const empName = employees.find(e => e.id === record.employee_id)?.name ?? "עובד";

    const dateLabel = new Date(record.date + "T00:00:00").toLocaleDateString("he-IL", {
      weekday: "long", day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Work Allocator <onboarding@resend.dev>",
        to: recipients,
        subject: `דיווח היעדרות: ${empName.slice(0, 100)}`,
        html: `
          <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#dc2626;margin-top:0">דיווח היעדרות</h2>
            <p style="font-size:15px">${escapeHtml(empName.slice(0, 100))} דיווח/ה על היעדרות ל<strong>${escapeHtml(dateLabel)}</strong>.</p>
            <p style="font-size:13px;color:#64748b">היכנסו למערכת כדי לסדר החלפה - המשבצת מסומנת "דורש החלפה".</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin:0">${APP_NAME} - התראה אוטומטית</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(err, { status: 500 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
```

- [ ] **Step 2: אימות סטטי** - `npx tsc --noEmit && npm test` (הקובץ Deno, לא נכלל ב-tsconfig של האפליקציה - בדיקת-שפיות שהאפליקציה לא נשברה). Expected: 80/80.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-absence/index.ts
git commit -m "feat: Edge Function notify-absence - מייל למנהלים על דיווח היעדרות"
```

---

### Task 8: מדריך משתמש (md + PDF)

**Files:**
- Modify: `public/user-guide.md`
- Regenerate: `public/user-guide.pdf`

- [ ] **Step 1:** בסוף פרק "העדפות שבועיות" (או במיקום ההגיוני לפי מבנה המדריך - לקרוא קודם), להוסיף:

```markdown
## דיווח היעדרות ומחלה

עובד שחלה אחרי פרסום השיבוץ יכול לדווח דרך הקישור האישי שלו: בעמוד השיתוף יש טופס "דיווח היעדרות / מחלה" - סימון היום ושליחה.

המנהל מקבל על כך מייל מיידי, ובאפליקציה מופיע באנר "דיווחי היעדרות לשבוע זה" והמשבצת של העובד מסומנת בנקודה אדומה "דורש החלפה". המנהל מסדר החלפה ולוחץ "טופל" כדי להסיר את הדיווח. הדוח החודשי מציג כמה ימי-מחלה דווחו לכל עובד.
```

- [ ] **Step 2:** יצירת PDF מחדש (התהליך הרגיל - marked + עטיפת RTL בתיקיית scratchpad + Chrome headless; תבנית מלאה: `docs/superpowers/plans/2026-07-18-export-empty-slots-warning.md` Task 2 Step 2).

- [ ] **Step 3:** אימות ויזואלי (Read ל-PDF) - הפרק מופיע, RTL תקין.

- [ ] **Step 4: Commit**

```bash
git add public/user-guide.md public/user-guide.pdf
git commit -m "docs: מדריך משתמש - דיווח היעדרות ומחלה"
```

---

### Task 9: אינטגרציה (מתזמר בלבד)

**מבוצע ע"י המתזמר בסשן הראשי (גישת Supabase MCP), לא ע"י סוכן-משנה.**

- [ ] **Step 1: סקירת-ענף סופית** (Opus - נוגע ב-DB, RLS, Edge Function, ומספר קבצי-ליבה) לפני החלה.
- [ ] **Step 2: החלת `supabase_absence.sql`** דרך `mcp__supabase__apply_migration` (name: `absence_reports_feature`).
- [ ] **Step 3: פריסת ה-Edge Function** `notify-absence` דרך `mcp__supabase__deploy_edge_function`.
- [ ] **Step 4: הגדרת ה-webhook** - Database Webhook על INSERT ל-`absence_reports` שקורא ל-`notify-absence`. אם לא ניתן דרך MCP - לרשום כפעולה ידנית של אמיר (Supabase Dashboard: Database - Webhooks) עם ההוראות המדויקות. לוודא ש-`RESEND_API_KEY` כבר מוגדר כ-secret (משמש את notify-new-user).
- [ ] **Step 5: בדיקת-עשן SQL** (MCP): INSERT token+published_schedules בדיקה, `get_share_absence_context` מחזיר weekStart/activeDays/[], `submit_absence_report` עם week_dates+sick_dates כותב שורות, שליחה חוזרת עם sick_dates מצומצם מוחקת, `get_advisors(security)` בלי ERROR חדש (הקשחת search_path כבר בקוד), ניקוי מלא.
- [ ] **Step 6: מיזוג ff ל-main + push** (פריסה אוטומטית ב-GitHub Actions), מעקב ירוק.
- [ ] **Step 7: אימות חי בפרודקשן** (Playwright + חשבון-בדיקה): פרסום שיבוץ, פתיחת קישור-עובד, דיווח מחלה, אימות שהמייל נשלח (לאמיר - היחיד עם deliverability), הבאנר והסימון-האדום מופיעים אצל המנהל, "טופל" מסיר, הדוח סופר. ניקוי מלא של נתוני-הבדיקה. עדכון memory.

## Self-Review (בוצע בכתיבה)

- **כיסוי spec:** טבלה+RPC (Task 1) · לוגיקה+Pro (Task 2) · טופס-עובד (Task 3) · טעינה+realtime+באנר (Task 4) · סימון-טבלה (Task 5) · ספירת-דוח (Task 6) · Edge Function (Task 7) · מדריך (Task 8) · החלה+webhook+עשן+חי (Task 9). אין פער.
- **עקביות שמות:** `AbsenceRecord{employeeId,date}` · `ShareAbsenceContext{weekStart,activeDays,currentSickDates}` · `absenceKey(date,name)` · `absentKeySet`/`absencesForWeek`/`buildSickCounts` · rpc `get_share_absence_context`/`submit_absence_report(share_token,week_dates,sick_dates)` - אחידים בין המשימות.
- **אין placeholders:** כל הקוד מלא; ה-"..." מציין רק "שאר ה-props הקיימים" עם הנחיה מפורשת לקרוא ולהתאים.
- **הערת-סוקרים:** `submit_absence_report` בטוח מפני token-לא-תקין (RETURN מוקדם); `notify-absence` שולח לכל מנהלי הארגון (עקבי עם פיצ'ר #3); deliverability מוגבל לדומיין-בדיקה של Resend - מתועד כפעולה ידנית עתידית.
