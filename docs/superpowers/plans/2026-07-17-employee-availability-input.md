# הזנת זמינות ע"י העובדים - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מאפשר לעובד להזין בעצמו, דרך קישור הצפייה האישי הקיים (`/s/:token`), אילו ימים בשבוע הפתוח הוא לא זמין - ההגשה נכנסת אוטומטית ל-`unavailableDays` שלו בלי אישור ידני של המנהל.

**Architecture:** טבלת "תיבת דואר נכנס" חדשה (`employee_availability`, שורה אחת פר עובד) + שתי פונקציות `SECURITY DEFINER` ציבוריות (קריאה וכתיבה, מאומתות דרך token קיים). בעמוד `/s/:token` מתווסף רכיב עצמאי שמציג טופס וקורא ל-RPC. בצד המנהל, בטעינת האפליקציה, ה-state המקומי של `employees` ממוזג עם הגשות ממתינות (פונקציה טהורה נפרדת, נבדקת ב-vitest) ואז השורות הממוזגות נמחקות מהתיבה.

**Tech Stack:** React + TypeScript, Supabase (Postgres + RPC), vitest.

## Global Constraints

- שפת עבודה: עברית בלבד - הודעות, הערות קוד, commit messages.
- מקף רגיל ( - ) בלבד, לא מקף ארוך. אין חצים (→ ← ↔) בטקסט עברי.
- דפוס בדיקות קיים בפרויקט: לוגיקה טהורה ב-`src/lib/*.ts` נבדקת ב-vitest; רכיבי React אינם מכוסים בבדיקות אוטומטיות (נבדקים ידנית).
- כל שינוי ל-`unavailableDays` על שבוע נתון הוא **החלפה מלאה** של פרוסת השבוע, לא union - כך שביטול-סימון של העובד מכובד.
- ה-Pro gate (`canUseAvailabilityInput`) דומם כברירת מחדל (`ENFORCE_QUOTA=false` ב-`src/lib/plan.ts`) - מחזיר `true` תמיד בשלב זה.

---

### Task 1: טבלת `employee_availability` ופונקציות RPC

**Files:**
- Create: `supabase_availability.sql`

**Interfaces:**
- Produces: טבלה `employee_availability(org_id, employee_id, week_start, unavailable_dates, updated_at)`, פונקציות `get_share_availability_context(share_token TEXT) RETURNS JSONB` ו-`submit_employee_availability(share_token TEXT, week_start TEXT, unavailable_dates JSONB) RETURNS VOID`, שהמשימות הבאות קוראות להן דרך `supabase.rpc(...)` ודרך `.from("employee_availability")`.

זהו קובץ SQL עצמאי - להריץ ידנית ב-Supabase SQL Editor (לא חלק מריצה אוטומטית, אין לו בדיקת vitest). אין תלות בטבלת `subscriptions` (שטרם רצה בפרודקשן) - ה-Pro gate נשאר בצד לקוח בלבד (Task 3).

- [ ] **Step 1: כתיבת הקובץ**

```sql
-- ════════════════════════════════════════════════════════
-- Employee Availability — הזנת זמינות ע"י העובדים (spec: 2026-07-17)
-- להריץ ב-Supabase → SQL Editor, בנפרד מהמיגרציה הראשית
-- דורש: organizations, get_my_org_id(), share_tokens, app_store (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

-- "תיבת דואר נכנס" של הגשות זמינות - שורה אחת פר עובד. שולחים שוב = דורס.
CREATE TABLE IF NOT EXISTS employee_availability (
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       TEXT NOT NULL,
  week_start        TEXT NOT NULL,
  unavailable_dates JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, employee_id)
);

ALTER TABLE employee_availability ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "availability_all" ON employee_availability;
CREATE POLICY "availability_all" ON employee_availability FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_availability TO service_role;

-- הדלת הציבורית הראשונה: מחזירה לעובד את השבוע הפתוח + הזמינות הנוכחית שלו,
-- כדי שהטופס בעמוד השיתוף ייטען מוכן. token לא קיים - NULL.
CREATE OR REPLACE FUNCTION get_share_availability_context(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'weekStart', (SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'weekStart'),
    'activeDays', (SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'activeDays'),
    'currentUnavailableDays', (
      SELECT COALESCE(
        (SELECT emp -> 'unavailableDays'
         FROM jsonb_array_elements((SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'employees')) AS emp
         WHERE emp ->> 'id' = t.employee_id),
        '[]'::jsonb)
    )
  )
  FROM share_tokens t
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_share_availability_context(TEXT) TO anon, authenticated;

-- הדלת הציבורית השנייה: העובד שולח/מעדכן את הזמינות שלו לשבוע הנתון.
-- upsert - שליחה חוזרת דורסת את הקודמת. token לא קיים - לא עושה דבר.
CREATE OR REPLACE FUNCTION submit_employee_availability(share_token TEXT, week_start TEXT, unavailable_dates JSONB)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  INSERT INTO employee_availability (org_id, employee_id, week_start, unavailable_dates, updated_at)
  SELECT t.org_id, t.employee_id, week_start, unavailable_dates, NOW()
  FROM share_tokens t WHERE t.token = share_token
  ON CONFLICT (org_id, employee_id)
  DO UPDATE SET week_start = EXCLUDED.week_start,
                unavailable_dates = EXCLUDED.unavailable_dates,
                updated_at = NOW();
$$;

GRANT EXECUTE ON FUNCTION submit_employee_availability(TEXT, TEXT, JSONB) TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase_availability.sql
git commit -m "feat: טבלת employee_availability + RPC להזנת זמינות ע\"י העובד"
```

---

### Task 2: לוגיקת המיזוג הטהורה (`src/lib/availability.ts`)

**Files:**
- Create: `src/lib/availability.ts`
- Test: `src/lib/availability.test.ts`

**Interfaces:**
- Consumes: `Employee` מ-`@/types/employee`, `getWeekDays` מ-`@/lib/week`.
- Produces: `mergeAvailabilitySubmissions(employees: Employee[], submissions: AvailabilitySubmission[], weekStart: Date, activeDays: number[]): Employee[]`, `interface AvailabilitySubmission { employeeId: string; unavailableDates: string[] }`, `interface ShareAvailabilityContext { weekStart: string; activeDays: number[]; currentUnavailableDays: string[] }` - Task 4 (`AvailabilityForm.tsx`) ו-Task 5 (`Index.tsx`) משתמשים בטיפוסים ובפונקציה האלה.

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

צור את `src/lib/availability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Employee } from "@/types/employee";
import { getWeekDays } from "@/lib/week";
import { mergeAvailabilitySubmissions } from "@/lib/availability";

const WEEK_START = new Date(2026, 6, 12); // יום ראשון
const emp = (id: string, name: string, unavailableDays: string[] = []): Employee => ({
  id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0, unavailableDays,
});
const days = getWeekDays(WEEK_START, [0, 1, 2]);

describe("mergeAvailabilitySubmissions", () => {
  it("אין הגשות - מחזיר את אותו מערך עובדים (זהות אובייקט)", () => {
    const employees = [emp("e1", "אבי")];
    expect(mergeAvailabilitySubmissions(employees, [], WEEK_START, [0, 1, 2])).toBe(employees);
  });

  it("מוסיף ימים לא-זמינים חדשים לעובד שהגיש", () => {
    const employees = [emp("e1", "אבי")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[0], days[2]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([days[0], days[2]]);
  });

  it("מחליף לגמרי את פרוסת השבוע - ביטול סימון קודם מכובד", () => {
    const employees = [emp("e1", "אבי", [days[0], days[1]])];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[1]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([days[1]]);
  });

  it("לא נוגע בתאריכים מחוץ לשבוע הרלוונטי", () => {
    const outsideDate = "2026-01-01";
    const employees = [emp("e1", "אבי", [outsideDate, days[0]])];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[1]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([outsideDate, days[1]]);
  });

  it("עובד שלא הגיש - לא מושפע כלל", () => {
    const employees = [emp("e1", "אבי", [days[0]]), emp("e2", "בני")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([]);
    expect(merged[1]).toBe(employees[1]);
  });

  it("הגשה לעובד שנמחק בינתיים - מתעלם, לא קורס", () => {
    const employees = [emp("e1", "אבי")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "ghost", unavailableDates: [days[0]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged).toEqual(employees);
  });
});
```

- [ ] **Step 2: הרצה לוודא כשל**

Run: `npm test -- src/lib/availability.test.ts`
Expected: FAIL - `Cannot find module '@/lib/availability'` (הקובץ עוד לא קיים).

- [ ] **Step 3: מימוש `src/lib/availability.ts`**

```ts
import { Employee } from "@/types/employee";
import { getWeekDays } from "@/lib/week";

/** נתוני ההקשר שמחזירה get_share_availability_context לעמוד השיתוף. */
export interface ShareAvailabilityContext {
  weekStart: string;               // ISO מלא (כפי שנשמר ב-app_store)
  activeDays: number[];
  currentUnavailableDays: string[];
}

export interface AvailabilitySubmission {
  employeeId: string;
  unavailableDates: string[];
}

/**
 * ממזג הגשות זמינות של עובדים לתוך unavailableDays - מחליף לגמרי את פרוסת
 * השבוע הרלוונטי (לא union), כדי שגם ביטול-סימון של העובד יכובד.
 * עובדים שלא הגישו, או שנמחקו, לא מושפעים.
 */
export function mergeAvailabilitySubmissions(
  employees: Employee[],
  submissions: AvailabilitySubmission[],
  weekStart: Date,
  activeDays: number[],
): Employee[] {
  if (submissions.length === 0) return employees;
  const weekDays = new Set(getWeekDays(weekStart, activeDays));
  const byEmployee = new Map(submissions.map(s => [s.employeeId, s]));
  return employees.map(emp => {
    const submission = byEmployee.get(emp.id);
    if (!submission) return emp;
    const outsideWeek = (emp.unavailableDays ?? []).filter(d => !weekDays.has(d));
    return { ...emp, unavailableDays: [...outsideWeek, ...submission.unavailableDates] };
  });
}
```

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npm test -- src/lib/availability.test.ts`
Expected: PASS - כל 6 הבדיקות ירוקות.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability.ts src/lib/availability.test.ts
git commit -m "feat: mergeAvailabilitySubmissions - מיזוג הגשות זמינות ל-unavailableDays"
```

---

### Task 3: שער Pro דומם (`canUseAvailabilityInput`)

**Files:**
- Modify: `src/lib/plan.ts`
- Test: `src/lib/plan.test.ts`

**Interfaces:**
- Produces: `canUseAvailabilityInput(): boolean` (בלי פרמטר `plan` - נקרא מעמוד ציבורי בלי `profile`). Task 4 (`AvailabilityForm.tsx`) קורא לפונקציה הזו.

- [ ] **Step 1: כתיבת הבדיקה הכושלת**

הוסף ל-`src/lib/plan.test.ts` (בתוך ה-`import` הקיים ובתוך ה-`describe` הקיים):

```ts
import {
  ENFORCE_QUOTA, FREE_EMPLOYEE_LIMIT, FREE_STATION_LIMIT,
  isOverEmployeeQuota, isOverStationQuota,
  canUseMultiSlotStations, canUseMonthlyReports, canUseAvailabilityInput,
} from "@/lib/plan";
```

ותוסיף בדיקה חדשה בתוך `describe("plan gates", ...)`:

```ts
  it("הזנת זמינות ע\"י העובד - מותרת כשהמתג כבוי, בלי תלות ב-plan", () => {
    expect(canUseAvailabilityInput()).toBe(true);
  });
```

- [ ] **Step 2: הרצה לוודא כשל**

Run: `npm test -- src/lib/plan.test.ts`
Expected: FAIL - `canUseAvailabilityInput is not a function` (או שגיאת import).

- [ ] **Step 3: מימוש ב-`src/lib/plan.ts`**

הוסף בסוף הקובץ, אחרי `canUseMonthlyReports`:

```ts
/**
 * הזנת זמינות ע"י העובד עצמו דרך הקישור האישי - פיצ'ר Pro.
 * ללא פרמטר plan (בשונה מיתר הבדיקות): נקראת מעמוד השיתוף הציבורי (anon, בלי
 * profile מחובר) - כל עוד ENFORCE_QUOTA כבוי, זו קריאה טהורה בלי תלות ב-DB.
 */
export function canUseAvailabilityInput(): boolean {
  return !ENFORCE_QUOTA;
}
```

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npm test -- src/lib/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts src/lib/plan.test.ts
git commit -m "feat: canUseAvailabilityInput - שער Pro דומם להזנת זמינות"
```

---

### Task 4: טופס הזמינות בעמוד השיתוף

**Files:**
- Create: `src/components/AvailabilityForm.tsx`
- Modify: `src/pages/SharePage.tsx`

**Interfaces:**
- Consumes: `ShareAvailabilityContext` מ-`@/lib/availability` (Task 2), `canUseAvailabilityInput` מ-`@/lib/plan` (Task 3), RPC-ים `get_share_availability_context` ו-`submit_employee_availability` (Task 1), `getWeekDays`/`getHebrewDayLabels`/`toISODateLocal`/`parseISODate` מ-`@/lib/week`.
- Produces: `<AvailabilityForm token={string} />` - רכיב עצמאי (מנהל את מצב הטעינה/שליחה שלו בעצמו, לא מקבל state מבחוץ). מרונדר `null` אם אין Supabase, השער כבוי, או שאין הקשר תקף.

אין בדיקת vitest לרכיב הזה (דפוס קיים בפרויקט - רכיבי React לא מכוסים בבדיקות אוטומטיות; הלוגיקה הטהורה כבר מכוסה ב-Task 2). האימות הוא ידני (Step 4 למטה).

- [ ] **Step 1: יצירת `src/components/AvailabilityForm.tsx`**

```tsx
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { canUseAvailabilityInput } from "@/lib/plan";
import { ShareAvailabilityContext } from "@/lib/availability";
import { getWeekDays, getHebrewDayLabels, toISODateLocal, parseISODate } from "@/lib/week";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarCheck } from "lucide-react";

interface AvailabilityFormProps {
  token: string;
}

type FormStatus = "loading" | "unavailable" | "ready" | "submitting" | "submitted" | "error";

interface FormState {
  status: FormStatus;
  context?: ShareAvailabilityContext;
  selected?: Set<string>;
}

// טופס עצמאי בעמוד השיתוף הציבורי - מאפשר לעובד לסמן ימים לא-זמינים לשבוע
// הפתוח אצל המנהל ולשלוח אותם. עצמאי מבחינת טעינה: לא תלוי בשליפת השיבוץ
// המפורסם שקורית באותו עמוד (get_shared_schedule) - הקשר שונה לגמרי.
export function AvailabilityForm({ token }: AvailabilityFormProps) {
  const [state, setState] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured || !canUseAvailabilityInput()) { setState({ status: "unavailable" }); return; }
    supabase!.rpc("get_share_availability_context", { share_token: token }).then(({ data, error }) => {
      const context = data as ShareAvailabilityContext | null;
      if (error || !context || !context.weekStart || !context.activeDays) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", context, selected: new Set(context.currentUnavailableDays ?? []) });
    });
  }, [token]);

  if (state.status === "loading" || state.status === "unavailable") return null;

  const { context, selected } = state as Required<FormState>;
  const weekStartDate = new Date(context.weekStart);
  const weekDays = getWeekDays(weekStartDate, context.activeDays);
  const hebrewDays = getHebrewDayLabels(context.activeDays);
  const submitting = state.status === "submitting";

  const toggle = (date: string) => {
    if (submitting) return;
    const next = new Set(selected);
    next.has(date) ? next.delete(date) : next.add(date);
    setState({ status: "ready", context, selected: next });
  };

  const submit = () => {
    setState({ status: "submitting", context, selected });
    supabase!.rpc("submit_employee_availability", {
      share_token: token,
      week_start: toISODateLocal(weekStartDate),
      unavailable_dates: Array.from(selected),
    }).then(({ error }) => {
      setState({ status: error ? "error" : "submitted", context, selected });
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">הזמינות שלך לשבוע הבא</p>
      </div>
      <p className="text-xs text-muted-foreground">סמן/י את הימים בהם אינך זמין/ה. השינוי יישלח למנהל.</p>
      <div className="space-y-1.5">
        {weekDays.map((date, idx) => (
          <div key={date} className="flex items-center space-x-2 space-x-reverse">
            <Checkbox
              id={`avail-${date}`}
              checked={selected.has(date)}
              disabled={submitting}
              onCheckedChange={() => toggle(date)}
            />
            <Label htmlFor={`avail-${date}`} className="cursor-pointer text-sm">
              {hebrewDays[idx]}{" "}
              <span className="text-xs text-muted-foreground">
                ({parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})
              </span>
            </Label>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={submit} disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח עדכון"}
      </Button>
      {state.status === "submitted" && <p className="text-xs text-primary font-medium">הזמינות עודכנה, תודה!</p>}
      {state.status === "error" && <p className="text-xs text-destructive font-medium">השליחה נכשלה, נסה/י שוב.</p>}
    </div>
  );
}
```

- [ ] **Step 2: חיווט ב-`src/pages/SharePage.tsx`**

הוסף import (ליד שאר ה-imports בראש הקובץ):

```ts
import { AvailabilityForm } from "@/components/AvailabilityForm";
```

והוסף את הרכיב בתוך ה-`<main>`, מיד אחרי סגירת ה-div של "המשמרות שלי" ולפני ה-comment `{/* טבלת השיבוץ המלאה - קריאה בלבד */}`:

```tsx
        <AvailabilityForm token={token!} />

        {/* טבלת השיבוץ המלאה - קריאה בלבד */}
```

- [ ] **Step 3: הרצת כל הבדיקות לוודא שלא נשבר כלום**

Run: `npm test`
Expected: PASS - כל הבדיקות הקיימות + החדשות ירוקות (אין בדיקות ל-`AvailabilityForm` עצמו, רק ל-TypeScript לקמפל).

- [ ] **Step 4: אימות ידני**

הרץ `npm run dev`, פתח קישור צפייה קיים (`/s/<token>` עם token תקף מ-`share_tokens` בסביבת הפיתוח), ווודא: הסקציה "הזמינות שלך לשבוע הבא" מוצגת עם ימי השבוע הפעילים, סימון/ביטול-סימון checkbox עובד, לחיצה על "שלח עדכון" מציגה "הזמינות עודכנה, תודה!" ויוצרת/מעדכנת שורה בטבלת `employee_availability` ב-Supabase (Table Editor).

- [ ] **Step 5: Commit**

```bash
git add src/components/AvailabilityForm.tsx src/pages/SharePage.tsx
git commit -m "feat: טופס הזמינות בעמוד השיתוף (/s/:token)"
```

---

### Task 5: מיזוג אוטומטי בצד המנהל

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `mergeAvailabilitySubmissions` מ-`@/lib/availability` (Task 2).

אין בדיקת vitest (דפוס קיים - `Index.tsx` הוא רכיב React, לא מכוסה בבדיקות אוטומטיות). האימות הוא ידני (Step 5 למטה).

- [ ] **Step 1: הוספת import**

ב-`src/pages/Index.tsx`, שנה את שורת ה-import הקיימת של `@/lib/week` (שורה 23) כך שתכלול גם `toISODateLocal`:

לפני:
```ts
import { getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS, ALL_HEBREW_DAYS, cellNames, stationSlots, cellKey, dailyShiftCap, parseISODate } from "@/lib/week";
```

אחרי:
```ts
import { getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS, ALL_HEBREW_DAYS, cellNames, stationSlots, cellKey, dailyShiftCap, parseISODate, toISODateLocal } from "@/lib/week";
```

והוסף import חדש מיד אחרי שורת ה-import הקיימת של `@/lib/share`:

לפני:
```ts
import { buildPublishedPayload, hasUnpublishedChanges, PublishedPayload } from "@/lib/share";
```

אחרי:
```ts
import { buildPublishedPayload, hasUnpublishedChanges, PublishedPayload } from "@/lib/share";
import { mergeAvailabilitySubmissions } from "@/lib/availability";
```

- [ ] **Step 2: הוספת `applyAvailabilitySubmissions`**

מצא את ההגדרה הקיימת של `syncToSupabase`:

```ts
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
```

והוסף מיד אחריה (לפני ה-`useEffect` הראשון של `localStorage.setItem("employees", ...)`):

```ts
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
    if (error || !submissions || submissions.length === 0) return;
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
    await supabase!.from("employee_availability").delete()
      .eq("org_id", profile.org_id).eq("week_start", weekStartIso);
  }, [profile?.org_id, toast]);
```

- [ ] **Step 3: חיווט לתוך אפקט הטעינה**

מצא את אפקט הטעינה הקיים:

```tsx
  // ── Load from Supabase on mount ────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !profile?.org_id) return;
    supabase!.from("app_store").select("key, value").eq("org_id", profile.org_id).then(({ data, error }) => {
      if (error || !data) { setSyncStatus("error"); return; }
      isRemoteUpdate.current = true;
      const store = Object.fromEntries(data.map(r => [r.key, r.value]));
      if (data.length === 0) {
        ORG_DATA_KEYS.forEach(k => localStorage.removeItem(k));
        setEmployees([]); setStations([]); setSchedule(null);
        setSavedSchedules([]); setTemplates([]); setLockedCells(new Set()); setAuditLog({});
        setCellColors(true);
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
          setWeekStart(weekEnd < new Date() ? getNextSunday(new Date()) : ws);
        }
        if (store.savedSchedules) setSavedSchedules(store.savedSchedules as SavedSchedule[]);
        if (store.scheduleTemplates) setTemplates(store.scheduleTemplates as ScheduleTemplate[]);
        if (store.lockedCells)    setLockedCells(new Set(store.lockedCells as string[]));
        if (store.auditLog)       setAuditLog(store.auditLog as { [k: string]: AuditEntry[] });
        if (store.cellColors !== undefined) setCellColors(store.cellColors as boolean);
        if (store.activeDays) setActiveDays(store.activeDays as number[]);
      }
      hasLoaded.current = true;
      setTimeout(() => { isRemoteUpdate.current = false; setSyncStatus("synced"); }, 200);
    });
  }, [profile?.org_id]);
```

והחלף אותו כולו בגרסה הבאה (מוסיפה `resolvedWeekStart`/`resolvedActiveDays` מקומיים ומפעילה את המיזוג רק אחרי ש-`isRemoteUpdate.current` חוזר ל-`false`, כדי ש-`setEmployees(merged)` יפעיל sync רגיל חזרה ל-Supabase):

```tsx
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
      }
      hasLoaded.current = true;
      setTimeout(() => {
        isRemoteUpdate.current = false;
        setSyncStatus("synced");
        if (data.length > 0 && store.employees) {
          applyAvailabilitySubmissions(store.employees as Employee[], resolvedWeekStart, resolvedActiveDays);
        }
      }, 200);
    });
  }, [profile?.org_id, applyAvailabilitySubmissions]);
```

- [ ] **Step 4: ניקוי מתיבת ההגשות במחיקת עובד**

מצא את `handleDeleteEmployee`:

```tsx
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
    }
    toast({ title: "העובד נמחק" });
  };
```

והחלף אותו ב:

```tsx
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
```

- [ ] **Step 5: הרצת כל הבדיקות + אימות ידני**

Run: `npm test`
Expected: PASS - כל הבדיקות (כולל Task 2 ו-3) ירוקות.

אימות ידני: הרץ `npm run dev`, התחבר כמנהל, ודא ששלב 4 ב-Task 4 (שליחת הזמינות דרך `/s/:token`) יצר שורה ב-`employee_availability`; רענן/פתח מחדש את אפליקציית המנהל על אותו שבוע (`weekStart` תואם) וודא: מופיע toast "הוחלו עדכוני זמינות מ-1 עובדים", בטאב "העדפות שבועיות" (`WeeklyPreferences`) הימים שהעובד סימן מופיעים כ"לא זמין", והשורה נעלמה מטבלת `employee_availability`. ואז ודא שביטול-סימון ידני של המנהל באותו יום נשמר גם אחרי רענון נוסף (אין הגשה נותרת שתדרוס אותו).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: מיזוג אוטומטי של הגשות זמינות עובדים ל-unavailableDays"
```
