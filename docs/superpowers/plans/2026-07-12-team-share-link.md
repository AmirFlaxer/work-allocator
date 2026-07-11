# Team Share Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** קישור צפייה אישי לכל עובד שמציג snapshot מפורסם של השיבוץ השבועי, עם הדגשת המשמרות שלו, בלי התחברות.

**Architecture:** טבלת `published_schedules` (snapshot אחד לארגון) + טבלת `share_tokens` (token לעובד), שתיהן נעולות ב-RLS; פונקציית SQL `get_shared_schedule(token)` עם SECURITY DEFINER היא הדלת הציבורית היחידה. בצד הלקוח: לוגיקה טהורה ב-`src/lib/share.ts` (payload, השוואת שינויים, חילוץ משמרות הצופה), עמוד ציבורי `/s/:token`, ודיאלוג ניהול קישורים למנהל.

**Tech Stack:** React 18 + TypeScript strict + Vite, Supabase (RPC + RLS), vitest, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-12-team-share-link-design.md`

## Global Constraints

- כל טקסט UI בעברית; מקף רגיל ( - ) בלבד, לא מקף ארוך; אין תווי חצים (→) בטקסט עברי.
- RTL: `dir="rtl"` על עמודים/דיאלוגים חדשים (DirectionProvider כבר עוטף את האפליקציה).
- צבעים דרך tokens של הערכה (`bg-card`, `text-muted-foreground`...) או עם וריאנט `dark:` - אף צבע קשיח בלי dark.
- TypeScript strict מופעל - הקוד חייב לעבור `npx tsc -p tsconfig.app.json --noEmit` נקי.
- אין להריץ את `supabase_migration.sql` (מכיל DROP TABLE). קובץ ה-SQL החדש עצמאי ומורץ ידנית על ידי אמיר.
- תאריכי מפתח (YYYY-MM-DD) נוצרים ונקראים רק דרך `toISODateLocal`/`parseISODate`/`getWeekDays` מ-`src/lib/week.ts` - לעולם לא `toISOString().split("T")` ולא `new Date("YYYY-MM-DD")` לתצוגה.
- הודעות סיום: כל commit מסתיים ב-`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: קובץ ה-SQL - טבלאות, RLS ופונקציה ציבורית

**Files:**
- Create: `supabase_share.sql`

**Interfaces:**
- Produces: טבלאות `published_schedules(org_id, payload, published_at)`, `share_tokens(token, org_id, employee_id, created_at)`, ופונקציה `get_shared_schedule(share_token TEXT) RETURNS JSONB` שמחזירה `{payload, publishedAt, viewerEmployeeId}` או NULL. משימות 3-4 מסתמכות על השמות האלה בדיוק.

- [ ] **Step 1: כתיבת הקובץ**

```sql
-- ════════════════════════════════════════════════════════
-- Team Share — קישור צפייה אישי לעובדים (spec: 2026-07-12)
-- להריץ ב-Supabase → SQL Editor, בנפרד מהמיגרציה הראשית
-- (supabase_migration.sql כבר רץ בפרודקשן ומכיל DROP TABLE - לא להריץ שוב!)
-- דורש: organizations + get_my_org_id() מהמיגרציה הראשית.
-- ════════════════════════════════════════════════════════

-- snapshot מפורסם - שורה אחת לארגון. פרסום חוזר דורס (upsert).
CREATE TABLE IF NOT EXISTS published_schedules (
  org_id       TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- קישור צפייה אישי - token לכל עובד. ביטול = מחיקת השורה.
CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, employee_id)
);

ALTER TABLE published_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_tokens        ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "published_all" ON published_schedules;
CREATE POLICY "published_all" ON published_schedules FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

DROP POLICY IF EXISTS "tokens_all" ON share_tokens;
CREATE POLICY "tokens_all" ON share_tokens FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON published_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON share_tokens        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON published_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON share_tokens        TO service_role;

-- הדלת הציבורית היחידה: token תקף מחזיר את ה-snapshot + זהות הצופה.
-- token לא קיים או שאין פרסום - NULL. אין דרך למנות ארגונים.
CREATE OR REPLACE FUNCTION get_shared_schedule(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'payload',          p.payload,
    'publishedAt',      p.published_at,
    'viewerEmployeeId', t.employee_id
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_shared_schedule(TEXT) TO anon, authenticated;
```

- [ ] **Step 2: בדיקה ידנית של הקובץ**

לקרוא שוב ולוודא: הפונקציה מוגדרת אחרי הטבלאות; אין שום policy עם `USING (true)`; ה-GRANT ל-anon הוא רק על הפונקציה.

- [ ] **Step 3: Commit**

```bash
git add supabase_share.sql
git commit -m "feat: סכימת קישורי צפייה לצוות - טבלאות, RLS ופונקציה ציבורית

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: לוגיקה טהורה - `src/lib/share.ts` (TDD)

**Files:**
- Create: `src/lib/share.ts`
- Test: `src/lib/share.test.ts`

**Interfaces:**
- Consumes: `Employee`, `Station`, `WeeklySchedule` מ-`@/types/employee`; `getWeekDays`, `getHebrewDayLabels`, `cellNames` מ-`@/lib/week`.
- Produces (משימות 3-4 מייבאות בדיוק את אלה):

```ts
export interface PublishedPayload {
  weekStart: string;            // ISO datetime
  activeDays: number[];
  stations: { id: number; name: string; requiredCount?: number }[];
  schedule: WeeklySchedule;
  employees: { id: string; name: string }[];
}
export interface SharedScheduleResponse {
  payload: PublishedPayload;
  publishedAt: string;
  viewerEmployeeId: string;
}
export interface ViewerShift { day: string; date: string; stationName: string; }

export function buildPublishedPayload(employees: Employee[], stations: Station[], schedule: WeeklySchedule, weekStart: Date, activeDays: number[]): PublishedPayload;
export function hasUnpublishedChanges(published: PublishedPayload | null, schedule: WeeklySchedule | null, weekStart: Date): boolean;
export function viewerName(payload: PublishedPayload, viewerEmployeeId: string): string | null;
export function viewerShifts(payload: PublishedPayload, viewerEmployeeId: string): ViewerShift[];
```

- [ ] **Step 1: כתיבת הבדיקות הנכשלות**

```ts
// src/lib/share.test.ts
import { describe, it, expect } from "vitest";
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays } from "@/lib/week";
import {
  buildPublishedPayload, hasUnpublishedChanges, viewerName, viewerShifts,
} from "@/lib/share";

const WEEK_START = new Date(2026, 6, 12); // יום ראשון

const emp = (id: string, name: string): Employee => ({
  id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0,
});
const st = (id: number, name: string, requiredCount = 1): Station => ({ id, name, requiredCount });

const days = getWeekDays(WEEK_START, [0, 1]);
const schedule: WeeklySchedule = {
  [days[0]]: { 1: ["אבי", ""], 2: ["בני"] },
  [days[1]]: { 1: ["בני", "אבי"], 2: [""] },
};
const employees = [emp("e1", "אבי"), emp("e2", "בני")];
const stations = [st(1, "קבלה", 2), st(2, "מוקד")];

describe("buildPublishedPayload", () => {
  it("אורז את כל הנתונים הדרושים לצופה", () => {
    const p = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);
    expect(p.weekStart).toBe(WEEK_START.toISOString());
    expect(p.activeDays).toEqual([0, 1]);
    expect(p.stations).toEqual([
      { id: 1, name: "קבלה", requiredCount: 2 },
      { id: 2, name: "מוקד", requiredCount: 1 },
    ]);
    expect(p.schedule).toEqual(schedule);
    expect(p.employees).toEqual([{ id: "e1", name: "אבי" }, { id: "e2", name: "בני" }]);
  });
});

describe("hasUnpublishedChanges", () => {
  const published = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);

  it("אין שיבוץ - אין מה לפרסם", () => {
    expect(hasUnpublishedChanges(published, null, WEEK_START)).toBe(false);
  });

  it("אין פרסום קודם אבל יש שיבוץ - יש שינויים", () => {
    expect(hasUnpublishedChanges(null, schedule, WEEK_START)).toBe(true);
  });

  it("שיבוץ זהה לפרסום - אין שינויים", () => {
    expect(hasUnpublishedChanges(published, schedule, WEEK_START)).toBe(false);
  });

  it("תא השתנה - יש שינויים", () => {
    const changed = { ...schedule, [days[0]]: { ...schedule[days[0]], 2: ["אבי"] } };
    expect(hasUnpublishedChanges(published, changed, WEEK_START)).toBe(true);
  });

  it("ניווט לשבוע אחר - יש שינויים", () => {
    const nextWeek = new Date(2026, 6, 19);
    expect(hasUnpublishedChanges(published, schedule, nextWeek)).toBe(true);
  });
});

describe("viewer helpers", () => {
  const payload = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);

  it("viewerName מתרגם מזהה לשם, ומחזיר null למזהה זר", () => {
    expect(viewerName(payload, "e1")).toBe("אבי");
    expect(viewerName(payload, "zzz")).toBeNull();
  });

  it("viewerShifts מחזיר את משמרות הצופה לפי סדר הימים", () => {
    expect(viewerShifts(payload, "e1")).toEqual([
      { day: "ראשון", date: days[0], stationName: "קבלה" },
      { day: "שני",   date: days[1], stationName: "קבלה" },
    ]);
    expect(viewerShifts(payload, "e2")).toEqual([
      { day: "ראשון", date: days[0], stationName: "מוקד" },
      { day: "שני",   date: days[1], stationName: "קבלה" },
    ]);
  });

  it("מזהה שלא ברשימה - רשימת משמרות ריקה", () => {
    expect(viewerShifts(payload, "zzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: הרצה לוודא כישלון**

Run: `npx vitest run src/lib/share.test.ts`
Expected: FAIL - `Cannot find module '@/lib/share'` (או שגיאת ייבוא דומה).

- [ ] **Step 3: מימוש מינימלי**

```ts
// src/lib/share.ts
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays, getHebrewDayLabels, cellNames } from "@/lib/week";

/** ה-snapshot שנשמר ב-published_schedules.payload - כל מה שהצופה צריך. */
export interface PublishedPayload {
  weekStart: string;
  activeDays: number[];
  stations: { id: number; name: string; requiredCount?: number }[];
  schedule: WeeklySchedule;
  /** מיפוי id-שם: ההדגשה לפי id כדי ששינוי שם לא ישבור קישורים */
  employees: { id: string; name: string }[];
}

/** מה שמחזירה פונקציית ה-SQL get_shared_schedule */
export interface SharedScheduleResponse {
  payload: PublishedPayload;
  publishedAt: string;
  viewerEmployeeId: string;
}

export interface ViewerShift { day: string; date: string; stationName: string; }

export function buildPublishedPayload(
  employees: Employee[],
  stations: Station[],
  schedule: WeeklySchedule,
  weekStart: Date,
  activeDays: number[],
): PublishedPayload {
  return {
    weekStart: weekStart.toISOString(),
    activeDays,
    stations: stations.map(s => ({ id: s.id, name: s.name, requiredCount: s.requiredCount ?? 1 })),
    schedule,
    employees: employees.map(e => ({ id: e.id, name: e.name })),
  };
}

/** האם שיבוץ העבודה הנוכחי שונה מה-snapshot שפורסם. */
export function hasUnpublishedChanges(
  published: PublishedPayload | null,
  schedule: WeeklySchedule | null,
  weekStart: Date,
): boolean {
  if (!schedule) return false;
  if (!published) return true;
  return published.weekStart !== weekStart.toISOString()
    || JSON.stringify(published.schedule) !== JSON.stringify(schedule);
}

export function viewerName(payload: PublishedPayload, viewerEmployeeId: string): string | null {
  return payload.employees.find(e => e.id === viewerEmployeeId)?.name ?? null;
}

/** משמרות הצופה מתוך ה-snapshot, לפי סדר הימים ואז סדר העמדות. */
export function viewerShifts(payload: PublishedPayload, viewerEmployeeId: string): ViewerShift[] {
  const name = viewerName(payload, viewerEmployeeId);
  if (!name) return [];
  const days = getWeekDays(new Date(payload.weekStart), payload.activeDays);
  const labels = getHebrewDayLabels(payload.activeDays);
  const shifts: ViewerShift[] = [];
  days.forEach((date, i) => {
    payload.stations.forEach(station => {
      if (cellNames(payload.schedule[date]?.[station.id]).includes(name)) {
        shifts.push({ day: labels[i], date, stationName: station.name });
      }
    });
  });
  return shifts;
}
```

שימו לב: הבדיקה של requiredCount מצפה ל-`requiredCount: 1` עבור עמדה בלי ערך - המימוש עושה `?? 1`, והבדיקה בנתה עמדה עם ברירת מחדל 1 מפורשת, כך ששניהם מתיישרים.

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npx vitest run src/lib/share.test.ts`
Expected: PASS - כל הבדיקות ירוקות.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share.ts src/lib/share.test.ts
git commit -m "feat: לוגיקת snapshot לשיתוף - payload, זיהוי שינויים ומשמרות הצופה

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: עמוד הצופה `/s/:token` + route ציבורי

**Files:**
- Create: `src/pages/SharePage.tsx`
- Modify: `src/App.tsx` (הוספת route ציבורי לפני שער ההתחברות)

**Interfaces:**
- Consumes: `SharedScheduleResponse`, `viewerName`, `viewerShifts` מ-`@/lib/share` (Task 2); `supabase`, `isSupabaseConfigured` מ-`@/lib/supabase`; `getWeekDays`, `getHebrewDayLabels`, `cellNames`, `stationSlots`, `parseISODate` מ-`@/lib/week`; `getEmployeeColor` מ-`@/lib/employeeColors`.
- Produces: רכיב `SharePage` (default export לא נדרש - named export `SharePage`).

- [ ] **Step 1: כתיבת SharePage.tsx**

```tsx
// src/pages/SharePage.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CalendarX } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { SharedScheduleResponse, viewerName, viewerShifts } from "@/lib/share";
import { getWeekDays, getHebrewDayLabels, cellNames, stationSlots, parseISODate } from "@/lib/week";
import { getEmployeeColor } from "@/lib/employeeColors";

type LoadState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "ready"; data: SharedScheduleResponse };

// עמוד ציבורי לצפייה בשיבוץ שפורסם - ללא התחברות. הזהות מגיעה מה-token.
export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [darkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!isSupabaseConfigured || !token) { setState({ status: "invalid" }); return; }
    supabase!.rpc("get_shared_schedule", { share_token: token }).then(({ data, error }) => {
      if (error || !data) setState({ status: "invalid" });
      else setState({ status: "ready", data: data as SharedScheduleResponse });
    });
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CalendarX className="h-8 w-8" />
          </div>
          <p className="text-lg font-semibold">הקישור בוטל או לא קיים</p>
          <p className="text-muted-foreground text-sm">בקשו קישור חדש מהמנהל</p>
        </div>
      </div>
    );
  }

  const { payload, publishedAt, viewerEmployeeId } = state.data;
  const myName = viewerName(payload, viewerEmployeeId);
  const myShifts = viewerShifts(payload, viewerEmployeeId);
  const weekDays = getWeekDays(new Date(payload.weekStart), payload.activeDays);
  const hebrewDays = getHebrewDayLabels(payload.activeDays);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.svg" alt="לוגו" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <span className="text-lg font-extrabold text-foreground leading-tight">השיבוץ השבועי</span>
            <p className="text-xs text-muted-foreground">
              עודכן: {new Date(publishedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-5">
        {/* המשמרות שלי */}
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs tracking-widest uppercase text-primary font-bold mb-1.5">
            המשמרות של {myName ?? "אורח"}
          </p>
          {myShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין לך משמרות בשבוע שפורסם</p>
          ) : (
            <p className="text-sm font-medium text-foreground">
              {myShifts.map(s => `${s.day} - ${s.stationName}`).join(" · ")}
            </p>
          )}
        </div>

        {/* טבלת השיבוץ המלאה - קריאה בלבד */}
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-right font-bold py-3 px-3 min-w-[110px] border-l border-border">עמדה</th>
                  {weekDays.map((date, idx) => (
                    <th key={date} className="text-center py-3 px-2 min-w-[110px]">
                      <div className="font-bold">{hebrewDays[idx]}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.stations.flatMap(station => {
                  const slots = stationSlots(station);
                  return Array.from({ length: slots }, (_, slotIndex) => (
                    <tr key={`${station.id}-${slotIndex}`} className="border-b border-border last:border-0">
                      {slotIndex === 0 && (
                        <td rowSpan={slots} className="font-bold text-right py-2 px-3 border-l border-border align-middle">
                          {station.name}
                        </td>
                      )}
                      {weekDays.map(date => {
                        const name = cellNames(payload.schedule[date]?.[station.id])[slotIndex] ?? "";
                        const isMine = name !== "" && name === myName;
                        const color = name ? getEmployeeColor(name, darkMode) : null;
                        return (
                          <td key={date} className="text-center py-2 px-2">
                            {name ? (
                              <span
                                className={`inline-block text-xs font-medium px-2.5 py-1 rounded-md border ${isMine ? "ring-2 ring-primary font-bold" : ""}`}
                                style={color ? { background: color.bg, color: color.text, borderRight: `3px solid ${color.accent}` } : undefined}
                              >
                                {name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          לצפייה בלבד · נוצר עם מערכת השיבוץ השבועי
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: פיצול שער ההתחברות ב-App.tsx**

להחליף את `AppContent` הקיים כך שה-route הציבורי נבדק לפני האימות. ב-`src/App.tsx`:

```tsx
// ייבוא חדש בראש הקובץ:
import { SharePage } from "@/pages/SharePage";

// AppContent הקיים משתנה לשני רכיבים:
function AppContent() {
  return (
    <Routes>
      {/* עמוד ציבורי - נטען בלי שער התחברות */}
      <Route path="/s/:token" element={<SharePage />} />
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

function AuthenticatedApp() {
  const { user, loading, profileMissing } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !user) {
    return <LoginPage />;
  }

  if (isSupabaseConfigured && user && profileMissing) {
    return <CompleteRegistrationPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/admin" element={<SuperAdminRoute><RegistrantsPage /></SuperAdminRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

(Routes מקוננים: ה-`path="*"` החיצוני מעביר את שאר הנתיבים פנימה, וה-Routes הפנימי ממשיך לעבוד עם נתיבים מלאים.)

- [ ] **Step 3: אימות קומפילציה**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run build`
Expected: שניהם נקיים.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SharePage.tsx src/App.tsx
git commit -m "feat: עמוד צפייה ציבורי /s/:token עם הדגשת משמרות הצופה

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: צד המנהל - פרסום, דיאלוג שיתוף וניקוי משורשר

**Files:**
- Create: `src/components/ShareLinksDialog.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `buildPublishedPayload`, `hasUnpublishedChanges`, `PublishedPayload` מ-`@/lib/share` (Task 2); הטבלאות מ-Task 1.
- Produces: `ShareLinksDialog` עם props: `{ open: boolean; onOpenChange: (open: boolean) => void; employees: Employee[]; orgId: string }`.

- [ ] **Step 1: כתיבת ShareLinksDialog.tsx**

```tsx
// src/components/ShareLinksDialog.tsx
import { useEffect, useState, useCallback } from "react";
import { Employee } from "@/types/employee";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Trash2, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  orgId: string;
}

// ניהול קישורי הצפייה האישיים: יצירה בהעתקה ראשונה, ביטול נקודתי.
export function ShareLinksDialog({ open, onOpenChange, employees, orgId }: ShareLinksDialogProps) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<{ [employeeId: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  // fallback כשה-clipboard לא זמין: מציגים את הקישור לסימון ידני
  const [manualLink, setManualLink] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("share_tokens").select("token, employee_id").eq("org_id", orgId);
    setTokens(Object.fromEntries((data ?? []).map(r => [r.employee_id as string, r.token as string])));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (open) { setConfirmRevokeId(null); setManualLink(null); loadTokens(); }
  }, [open, loadTokens]);

  const linkFor = (token: string) => `${window.location.origin}/s/${token}`;

  const handleCopy = async (emp: Employee) => {
    if (!supabase) return;
    let token = tokens[emp.id];
    if (!token) {
      token = crypto.randomUUID();
      const { error } = await supabase.from("share_tokens")
        .insert({ token, org_id: orgId, employee_id: emp.id });
      if (error) { toast({ title: "שגיאה ביצירת הקישור", variant: "destructive" }); return; }
      setTokens(prev => ({ ...prev, [emp.id]: token! }));
    }
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopiedId(emp.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setManualLink(linkFor(token));
    }
  };

  const handleRevoke = async (emp: Employee) => {
    if (!supabase) return;
    if (confirmRevokeId !== emp.id) { setConfirmRevokeId(emp.id); return; }
    const { error } = await supabase.from("share_tokens")
      .delete().eq("org_id", orgId).eq("employee_id", emp.id);
    if (error) { toast({ title: "שגיאה בביטול הקישור", variant: "destructive" }); return; }
    setTokens(prev => {
      const next = { ...prev };
      delete next[emp.id];
      return next;
    });
    setConfirmRevokeId(null);
    toast({ title: `הקישור של ${emp.name} בוטל` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> קישורי צפייה לצוות
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          לכל עובד קישור אישי קבוע לצפייה בשיבוץ שפורסם. שלחו בוואטסאפ פעם אחת - הוא ממשיך לעבוד גם אחרי החלפת מכשיר.
        </p>
        {manualLink && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ההעתקה האוטומטית נכשלה - סמנו והעתיקו ידנית:</p>
            <Input readOnly value={manualLink} dir="ltr" onFocus={e => e.target.select()} />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין עובדים עדיין</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {employees.map(emp => (
              <div key={emp.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                <span className="text-sm font-medium truncate">{emp.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleCopy(emp)}>
                    {copiedId === emp.id
                      ? <><Check className="h-3.5 w-3.5 ml-1 text-emerald-500" /> הועתק</>
                      : <><Copy className="h-3.5 w-3.5 ml-1" /> {tokens[emp.id] ? "העתק קישור" : "צור קישור"}</>}
                  </Button>
                  {tokens[emp.id] && (
                    <Button
                      size="sm"
                      variant={confirmRevokeId === emp.id ? "destructive" : "ghost"}
                      onClick={() => handleRevoke(emp)}
                      title={confirmRevokeId === emp.id ? "לחצו שוב לאישור הביטול" : "בטל קישור"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmRevokeId === emp.id && <span className="mr-1 text-xs">בטוח?</span>}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: חיבור ב-Index.tsx - state, טעינה ופרסום**

ייבוא בראש הקובץ:

```ts
import { buildPublishedPayload, hasUnpublishedChanges, PublishedPayload } from "@/lib/share";
import { ShareLinksDialog } from "@/components/ShareLinksDialog";
// להוסיף Megaphone, Share2 לרשימת האייקונים המיובאים מ-lucide-react
```

State חדש (ליד ה-state של ה-plan, אחרי `const [upgradeReason, ...]`):

```ts
// ── Team share (פרסום לצוות) ────────────────────────────
const [publishedPayload, setPublishedPayload] = useState<PublishedPayload | null>(null);
const [publishedAt, setPublishedAt] = useState<string | null>(null);
const [shareDialogOpen, setShareDialogOpen] = useState(false);

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

const unpublishedChanges = hasUnpublishedChanges(publishedPayload, schedule, weekStart);

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
```

- [ ] **Step 3: חיבור ב-Index.tsx - כפתורים וחיווי**

בשורת כפתורי הפעולות של לשונית השיבוץ, אחרי כפתור "צור שיבוץ" ולפני "שמור", להוסיף (מוצג רק כשיש Supabase):

```tsx
{/* Publish + share */}
{isSupabaseConfigured && schedule && (
  <Button variant={unpublishedChanges ? "default" : "outline"} onClick={handlePublish}
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
```

ובסוף ה-JSX, ליד שאר הדיאלוגים:

```tsx
{/* Share links dialog */}
{isSupabaseConfigured && profile?.org_id && (
  <ShareLinksDialog
    open={shareDialogOpen}
    onOpenChange={setShareDialogOpen}
    employees={employees}
    orgId={profile.org_id}
  />
)}
```

- [ ] **Step 4: ניקוי משורשר - מחיקת עובד מבטלת את הקישור שלו**

בתוך `handleDeleteEmployee` הקיים, אחרי ניקוי התאים:

```ts
// ביטול קישור הצפייה של העובד (אם יש) - fire and forget
if (isSupabaseConfigured && profile?.org_id) {
  supabase!.from("share_tokens").delete()
    .eq("org_id", profile.org_id).eq("employee_id", id)
    .then(() => {});
}
```

- [ ] **Step 5: אימות מלא**

Run: `npx vitest run && npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm run build`
Expected: הכל ירוק (18 בדיקות: 12 scheduler + 3 plan + 3 קבצי share לפי Task 2... בפועל: כל הבדיקות עוברות).

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareLinksDialog.tsx src/pages/Index.tsx
git commit -m "feat: פרסום לצוות - כפתור פרסום, דיאלוג קישורים אישיים וניקוי משורשר

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: מדריך משתמש + אימות סופי

**Files:**
- Modify: `public/user-guide.md` (סעיף חדש בלשונית השיבוץ)
- Modify: `public/user-guide.pdf` (יצירה מחדש)

**Interfaces:**
- Consumes: התנהגות הפיצ'ר ממשימות 3-4.

- [ ] **Step 1: הוספת סעיף למדריך**

ב-`public/user-guide.md`, אחרי סעיף "### ייצוא" בלשונית השיבוץ, להוסיף:

```markdown
### פרסום לצוות

- **פרסם לצוות** - שומר גרסה של השיבוץ שהעובדים רואים. אפשר להמשיך לטייט ולערוך - הצוות רואה רק את מה שפורסם. נקודה כתומה על הכפתור מסמנת שינויים שטרם פורסמו.
- **שיתוף** - קישור צפייה אישי לכל עובד: העתיקו ושלחו בוואטסאפ פעם אחת. העובד רואה את הטבלה המלאה עם המשמרות שלו מודגשות, בלי צורך בחשבון. הקישור קבוע (עובד גם אחרי החלפת מכשיר), וניתן לביטול נקודתי בכל רגע.
```

- [ ] **Step 2: יצירת ה-PDF מחדש**

התהליך המתועד (memory: user-guides-maintenance): `npx -y marked` להמרת ה-md ל-HTML, עטיפה בתבנית ה-RTL (קיימת ב-scratchpad מהסשן: head.html), ואז Chrome headless:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="<יעד>" "<HTML מלא>"
```

לאמת ויזואלית (screenshot) שה-RTL תקין, ואז להעתיק ל-`public/user-guide.pdf`.

- [ ] **Step 3: אימות סופי מלא**

Run: `npx vitest run && npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm run build`
Expected: הכל ירוק.

- [ ] **Step 4: Commit**

```bash
git add public/user-guide.md public/user-guide.pdf
git commit -m "docs: מדריך משתמש - פרסום לצוות וקישורי צפייה אישיים

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## הפעלה (ידני - אמיר)

1. להריץ `supabase_share.sql` ב-Supabase SQL Editor (בלבד! לא את המיגרציה הראשית).
2. לדחוף ולפרוס (`npx vercel --prod` באישור).
3. בדיקת עשן: פרסום שיבוץ, יצירת קישור לעובד, פתיחה בחלון גלישה בסתר - הטבלה מוצגת והמשמרות מודגשות; ביטול הקישור - העמוד מציג "הקישור בוטל".
