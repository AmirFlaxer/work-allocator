# הוגנות בין-שבועית באלגוריתם השיבוץ - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `generateWeeklySchedule` מעדיף עובד עם פחות משמרות ב-4 השבועות האחרונים כשהוא בוחר בין מועמדים שווים בכל שאר הקריטריונים - בלי שום שינוי ממשק.

**Architecture:** פונקציה חדשה (`calculateRecentLoad`) סופרת משמרות היסטוריות מתוך `savedSchedules` הקיים, וה-score שלה נכנס כקריטריון-שני לשלבי הבחירה הקיימים באלגוריתם (`leastLoaded` בשלבים 5-6, סדר הרשימה בשלב 4, שבירת-תיקו בשלב 2). דה-דופ שבוע-כפול משותף עם `MonthlyReport.tsx` דרך פונקציה מועברת ל-`week.ts`.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- TypeScript strict מופעל - כל שינוי חייב לעבור `npx tsc -p tsconfig.app.json --noEmit` נקי.
- תאריכי מפתח (YYYY-MM-DD) נוצרים ונקראים רק דרך `toISODateLocal`/`parseISODate`/`getWeekDays` מ-`src/lib/week.ts` - לעולם לא `toISOString().split("T")` ולא `new Date("YYYY-MM-DD")`.
- אין שינוי ממשק משתמש (אין UI חדש) - כל השינוי בשכבת האלגוריתם/לוגיקה בלבד.
- 9 קריאות הבדיקה הקיימות ל-`generateWeeklySchedule` ב-`scheduler.test.ts` (בלי הפרמטר החדש) חייבות להמשיך לעבור ללא שינוי בתוצאה הצפויה - התנהגות ברירת המחדל (בלי `savedSchedules`) חייבת להישאר זהה למצב לפני השינוי.
- הודעות commit: כל commit מסתיים ב-`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: העברת דה-דופ שבוע-כפול ל-`week.ts` + תיקון timezone

**Files:**
- Modify: `src/lib/week.ts`
- Modify: `src/components/MonthlyReport.tsx:1-3, 29-39, 135`
- Test: `src/lib/scheduler.test.ts` (בתוך `describe("week helpers", ...)` הקיים, שורה 113-123)

**Interfaces:**
- Produces: `latestSchedulePerWeek(savedSchedules: SavedSchedule[]): SavedSchedule[]` - שבוע-לוח אחד לכל שמירה, נשארת רק זו עם `savedAt` המאוחר ביותר. משימות 2 סומכת על השם והחתימה הזו.

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

הוסף בתוך ה-`describe("week helpers", ...)` הקיים ב-`src/lib/scheduler.test.ts` (אחרי הבדיקה `"getWeekDays מעוגן..."`, לפני הסוגר `});` של ה-describe, שורה ~122):

```ts
  it("latestSchedulePerWeek משאיר רק את השמירה האחרונה של כל שבוע", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "טיוטה", schedule: {}, weekStart: day, savedAt: "2026-07-10T08:00:00.000Z" },
      { id: "2", name: "סופי", schedule: {}, weekStart: day, savedAt: "2026-07-12T08:00:00.000Z" },
    ];
    const result = latestSchedulePerWeek(saved);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("latestSchedulePerWeek משאיר שבועות שונים בנפרד", () => {
    const [day1] = getWeekDays(WEEK_START, [0]);
    const [day2] = getWeekDays(new Date(2026, 6, 19), [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "א", schedule: {}, weekStart: day1, savedAt: "2026-07-10T08:00:00.000Z" },
      { id: "2", name: "ב", schedule: {}, weekStart: day2, savedAt: "2026-07-17T08:00:00.000Z" },
    ];
    expect(latestSchedulePerWeek(saved)).toHaveLength(2);
  });
```

עדכן את שורת ה-import של `scheduler.test.ts` (שורה 2 ו-4) להוסיף את הטיפוס והפונקציה החדשים:

```ts
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { generateWeeklySchedule, countFilledSlots, calculateWorkloads } from "@/lib/scheduler";
import { getWeekDays, cellKey, cellNames, toISODateLocal, parseISODate, DEFAULT_ACTIVE_DAYS, latestSchedulePerWeek } from "@/lib/week";
```

- [ ] **Step 2: הרצת הבדיקות לוודא כשל**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: FAIL - `latestSchedulePerWeek is not a function` (או שגיאת import/TS).

- [ ] **Step 3: הוספת הפונקציה ל-`week.ts`**

ב-`src/lib/week.ts`, עדכן את שורת ה-import הראשונה (שורה 1) להוסיף את `SavedSchedule`:

```ts
import { Station, Cell, Employee, SavedSchedule } from "@/types/employee";
```

הוסף בסוף הקובץ (אחרי `cellKey`, שורה 71):

```ts

// Only the latest save of each calendar week counts - saving the same week
// twice (draft then final) must not double-count shifts in reports or in
// the scheduler's inter-week fairness calculation.
export function latestSchedulePerWeek(savedSchedules: SavedSchedule[]): SavedSchedule[] {
  const byWeek = new Map<string, SavedSchedule>();
  savedSchedules.forEach(s => {
    const weekKey = getWeekDays(parseISODate(s.weekStart), [0])[0];
    const existing = byWeek.get(weekKey);
    if (!existing || s.savedAt > existing.savedAt) byWeek.set(weekKey, s);
  });
  return Array.from(byWeek.values());
}
```

(שים לב: `parseISODate(s.weekStart)`, לא `new Date(s.weekStart)` - זה התיקון לבאג ה-timezone המתועד בהערה של `parseISODate` עצמה, שורות 25-27.)

- [ ] **Step 4: הרצת הבדיקות לוודא הצלחה**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: PASS - כל הבדיקות כולל השתיים החדשות.

- [ ] **Step 5: עדכון `MonthlyReport.tsx` להשתמש בפונקציה המשותפת**

ב-`src/components/MonthlyReport.tsx`, עדכן את שורת ה-import (שורה 3):

```ts
import { cellNames, parseISODate, getWeekDays, latestSchedulePerWeek } from "@/lib/week";
```

מחק את הפונקציה המקומית `latestPerWeek` (שורות 29-39, כולל ההערה שמעליה):

```ts
// Only the latest save of each week counts - saving the same week twice
// (e.g. draft then final) must not double-count shifts in payroll reports.
function latestPerWeek(savedSchedules: SavedSchedule[]): SavedSchedule[] {
  const byWeek = new Map<string, SavedSchedule>();
  savedSchedules.forEach(s => {
    const weekKey = getWeekDays(new Date(s.weekStart), [0])[0];
    const existing = byWeek.get(weekKey);
    if (!existing || s.savedAt > existing.savedAt) byWeek.set(weekKey, s);
  });
  return Array.from(byWeek.values());
}
```

ועדכן את קריאת ה-`useMemo` (שורה 135) מ-`latestPerWeek(savedSchedules)` ל-`latestSchedulePerWeek(savedSchedules)`:

```ts
  const uniqueSchedules = useMemo(() => latestSchedulePerWeek(savedSchedules), [savedSchedules]);
```

- [ ] **Step 6: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: כל הבדיקות עוברות (כולל אלו הקיימות ב-`scheduler.test.ts`), tsc נקי.

- [ ] **Step 7: Commit**

```bash
git add src/lib/week.ts src/lib/scheduler.test.ts src/components/MonthlyReport.tsx
git commit -m "$(cat <<'EOF'
refactor: latestSchedulePerWeek משותף ב-week.ts + תיקון timezone

הפונקציה הועברה מ-MonthlyReport.tsx (שם היתה מקומית) כדי שגם
scheduler.ts יוכל להשתמש בה להוגנות בין-שבועית. תוך כדי: new Date(weekStart)
הוחלף ב-parseISODate - אותו באג-timezone שתוקן כבר במקומות אחרים בפרויקט.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `calculateRecentLoad` - חישוב עומס היסטורי

**Files:**
- Modify: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `latestSchedulePerWeek(savedSchedules: SavedSchedule[]): SavedSchedule[]` ו-`parseISODate(iso: string): Date` מ-Task 1.
- Produces: `calculateRecentLoad(savedSchedules: SavedSchedule[], currentWeekStart: Date, weekCount = 4): Map<string, number>` - מפתח = שם עובד, ערך = סה"כ משמרות ב-`weekCount` השבועות האחרונים שנשמרו **לפני** `currentWeekStart` (לא כולל אותו). משימה 3 סומכת על השם והחתימה הזו.

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

הוסף ב-`src/lib/scheduler.test.ts` שני helpers חדשים **מיד אחרי** `const namesAt = ...` הקיים (שורה 18-19), **לפני** `describe("generateWeeklySchedule", ...)` (שורה 21) - חשוב שהם יופיעו לפני שני ה-describe (הקיים והחדש) בקובץ, כי שניהם `const` (לא הופכי-הכרזה/hoisted) ומשימה 3 תשתמש בהם בתוך ה-describe המוקדם יותר:

```ts
const weekOf = (year: number, month: number, day: number) => new Date(year, month, day);

const savedWeek = (weekStart: Date, savedAt: string, names: Record<string, number>): SavedSchedule => {
  const [day] = getWeekDays(weekStart, [0]);
  const schedule: WeeklySchedule = { [day]: {} };
  let stationId = 1;
  Object.entries(names).forEach(([name, count]) => {
    for (let i = 0; i < count; i++) {
      schedule[day][stationId] = [name];
      stationId++;
    }
  });
  return { id: savedAt, name: toISODateLocal(weekStart), schedule, weekStart: day, savedAt };
};
```

ואז הוסף `describe("calculateRecentLoad", ...)` חדש **אחרי** סגירת ה-`describe("generateWeeklySchedule", ...)` הקיים (אחרי הבדיקה `"calculateWorkloads סופר משבצות..."` ואחרי ה-`});` שסוגר את ה-describe כולו, לפני `describe("week helpers", ...)`):

```ts
describe("calculateRecentLoad", () => {
  it("סופר משמרות רק ב-4 השבועות שלפני השבוע הנוכחי, לא כולל אותו", () => {
    const saved: SavedSchedule[] = [
      savedWeek(weekOf(2026, 5, 7), "2026-06-08T08:00:00.000Z", { "אבי": 1 }),   // 5 שבועות אחורה - מחוץ לחלון
      savedWeek(weekOf(2026, 5, 14), "2026-06-15T08:00:00.000Z", { "אבי": 1 }),  // 4 שבועות אחורה
      savedWeek(weekOf(2026, 5, 21), "2026-06-22T08:00:00.000Z", { "אבי": 1 }),  // 3 שבועות אחורה
      savedWeek(weekOf(2026, 5, 28), "2026-06-29T08:00:00.000Z", { "בני": 1 }),  // 2 שבועות אחורה
      savedWeek(weekOf(2026, 6, 5), "2026-07-06T08:00:00.000Z", { "אבי": 1 }),   // שבוע אחורה
      savedWeek(WEEK_START, "2026-07-13T08:00:00.000Z", { "אבי": 5 }),           // השבוע הנוכחי - לא נספר
    ];
    const load = calculateRecentLoad(saved, WEEK_START);
    expect(load.get("אבי")).toBe(3); // 4/3/1 שבועות אחורה; 5-שבועות-אחורה מחוץ לחלון
    expect(load.get("בני")).toBe(1);
  });

  it("מאחד שמירה כפולה של אותו שבוע - נספרת רק האחרונה", () => {
    const priorWeek = weekOf(2026, 6, 5);
    const [day] = getWeekDays(priorWeek, [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "טיוטה", schedule: { [day]: { 1: ["אבי"] } }, weekStart: day, savedAt: "2026-07-06T08:00:00.000Z" },
      { id: "2", name: "סופי", schedule: { [day]: { 1: ["בני"] } }, weekStart: day, savedAt: "2026-07-07T08:00:00.000Z" },
    ];
    const load = calculateRecentLoad(saved, WEEK_START);
    expect(load.get("אבי")).toBeUndefined();
    expect(load.get("בני")).toBe(1);
  });
});
```

ועדכן את import ה-`calculateWorkloads` (שורה 3) להוסיף את `calculateRecentLoad`:

```ts
import { generateWeeklySchedule, countFilledSlots, calculateWorkloads, calculateRecentLoad } from "@/lib/scheduler";
```

- [ ] **Step 2: הרצת הבדיקות לוודא כשל**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: FAIL - `calculateRecentLoad is not a function`.

- [ ] **Step 3: מימוש הפונקציה**

ב-`src/lib/scheduler.ts`, עדכן את שתי שורות ה-import הראשונות (שורות 1-2):

```ts
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { getWeekDays, cellNames, stationSlots, cellKey, dailyShiftCap, latestSchedulePerWeek, parseISODate } from "@/lib/week";
```

הוסף בסוף הקובץ, אחרי `calculateWorkloads` (אחרי שורה 200, לפני הסוגר האחרון של הקובץ):

```ts

// Total shifts each employee (by name) worked across the most recent
// weekCount saved weeks strictly before currentWeekStart - lets the
// generator favor whoever has had fewer shifts recently (inter-week fairness).
export function calculateRecentLoad(
  savedSchedules: SavedSchedule[],
  currentWeekStart: Date,
  weekCount = 4
): Map<string, number> {
  const currentWeekKey = getWeekDays(currentWeekStart, [0])[0];
  const priorWeeks = latestSchedulePerWeek(savedSchedules)
    .map(s => ({ saved: s, weekKey: getWeekDays(parseISODate(s.weekStart), [0])[0] }))
    .filter(({ weekKey }) => weekKey < currentWeekKey)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
    .slice(0, weekCount)
    .map(({ saved }) => saved);

  const load = new Map<string, number>();
  priorWeeks.forEach(saved => {
    Object.values(saved.schedule).forEach(day => {
      Object.values(day).forEach(cell => {
        cellNames(cell).forEach(name => {
          if (name) load.set(name, (load.get(name) ?? 0) + 1);
        });
      });
    });
  });
  return load;
}
```

- [ ] **Step 4: הרצת הבדיקות לוודא הצלחה**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: PASS - כל הבדיקות כולל השתיים החדשות.

- [ ] **Step 5: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: הכל ירוק.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "$(cat <<'EOF'
feat: calculateRecentLoad - עומס היסטורי מ-4 שבועות אחרונים

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: שילוב העומס ההיסטורי בשלבי הבחירה של האלגוריתם

**Files:**
- Modify: `src/lib/scheduler.ts:4-176` (`generateWeeklySchedule`)
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `calculateRecentLoad` מ-Task 2.
- Produces: `generateWeeklySchedule(..., savedSchedules?: SavedSchedule[])` - פרמטר שביעי אופציונלי חדש, בסוף רשימת הפרמטרים. משימה 4 מעבירה אליו את `savedSchedules` מ-`Index.tsx`.

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

הוסף בתוך `describe("generateWeeklySchedule", ...)` הקיים ב-`src/lib/scheduler.test.ts` (אחרי הבדיקה `"calculateWorkloads סופר משבצות..."`, לפני הסוגר `});` של ה-describe, שורה ~110):

```ts
  it("שלב 4: מעדיף עובד עם עומס-עבר נמוך יותר, לא לפי סדר הרשימה", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [
      emp({ id: "a", name: "אבי" }), // ראשון ברשימה - בלי הוגנות היה זוכה קודם
      emp({ id: "b", name: "בני" }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1], undefined, undefined, saved);
    expect(namesAt(schedule, days[0], 1)).toEqual(["בני"]);
  });

  it("שלב 2: בין מכוכבים עם אותו minWeeklyShifts, עומס-עבר שובר תיקו", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [
      emp({ id: "a", name: "אבי", hasStar: true, minWeeklyShifts: 1, maxWeeklyShifts: 1 }),
      emp({ id: "b", name: "בני", hasStar: true, minWeeklyShifts: 1, maxWeeklyShifts: 1 }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1], undefined, undefined, saved);
    expect(namesAt(schedule, days[0], 1)).toEqual(["בני"]);
  });

  it("שלבים 5-6 (leastLoaded): עומס-עבר משפיע גם על משמרת שנייה באותו יום", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const employees = [
      emp({ id: "a", name: "אבי", maxDailyShifts: 2 }),
      emp({ id: "b", name: "בני", maxDailyShifts: 2 }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    // עמדה 1 (2 משבצות) מתמלאת בשלב 4 - אבי ובני, אחד כל אחד. המשבצת היחידה
    // של עמדה 2 נותרת לשלב 6 (משמרת שנייה באותו יום למי שכבר עבד) - שם בני
    // (עומס כולל 0+1=1) עדיף על אבי (עומס כולל 1+1=2) ומקבל אותה.
    const schedule = generateWeeklySchedule(employees, [st(1, 2), st(2, 1)], WEEK_START, [0], undefined, undefined, saved);
    expect(namesAt(schedule, day, 1).sort()).toEqual(["אבי", "בני"]);
    expect(namesAt(schedule, day, 2)).toEqual(["בני"]);
  });
```

- [ ] **Step 2: הרצת הבדיקות לוודא כשל**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: FAIL - שלוש הבדיקות החדשות נכשלות (הפרמטר השביעי לא קיים עדיין / ההעדפה לא ממומשת).

- [ ] **Step 3: הוספת הפרמטר וחישוב ה-load**

ב-`src/lib/scheduler.ts`, עדכן את חתימת `generateWeeklySchedule` (שורות 4-11):

```ts
export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>,
  savedSchedules?: SavedSchedule[]
): WeeklySchedule {
```

הוסף מיד אחרי שורת ה-`const weekDays = getWeekDays(weekStart, activeDays);` (שורה 13):

```ts
  const recentLoad = savedSchedules ? calculateRecentLoad(savedSchedules, weekStart) : new Map<string, number>();
```

- [ ] **Step 4: עדכון `leastLoaded` (שלבים 5-6)**

מצא את ההגדרה הקיימת (שורות 65-69):

```ts
  // Of the eligible employees, the one with the fewest assigned days so far -
  // picking the first match would pile extra shifts on whoever is listed first.
  const leastLoaded = (candidates: Employee[]): Employee | undefined =>
    candidates.reduce<Employee | undefined>((best, emp) =>
      !best || getAssignedCount(emp.id) < getAssignedCount(best.id) ? emp : best, undefined);
```

והחלף ב:

```ts
  // Combined score: shifts assigned this week so far, plus shifts worked in
  // the recent-weeks history - so leastLoaded favors whoever has had the
  // least total exposure recently, not just within the current week.
  const totalRecentLoad = (emp: Employee) =>
    getAssignedCount(emp.id) + (recentLoad.get(emp.name) ?? 0);

  // Of the eligible employees, the one with the fewest total assigned shifts
  // (this week + recent history) - picking the first match would pile extra
  // shifts on whoever is listed first.
  const leastLoaded = (candidates: Employee[]): Employee | undefined =>
    candidates.reduce<Employee | undefined>((best, emp) =>
      !best || totalRecentLoad(emp) < totalRecentLoad(best) ? emp : best, undefined);
```

- [ ] **Step 5: עדכון שלב 2 (שבירת תיקו)**

מצא (שורות 94-98):

```ts
  // Pass 2: Fill with starred employees (by minWeeklyShifts desc), one shift/day.
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) => b.minWeeklyShifts - a.minWeeklyShifts)
    .forEach(employee => {
```

והחלף את שורת ה-`.sort` ב:

```ts
  // Pass 2: Fill with starred employees (by minWeeklyShifts desc, then recent
  // history ascending as a tie-break), one shift/day.
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) =>
      b.minWeeklyShifts - a.minWeeklyShifts ||
      (recentLoad.get(a.name) ?? 0) - (recentLoad.get(b.name) ?? 0))
    .forEach(employee => {
```

- [ ] **Step 6: עדכון שלב 4 (מיון לפי עומס-עבר)**

מצא (שורות 127-128):

```ts
  // Pass 4: Fill with non-starred employees (one per day).
  employees.filter(emp => !emp.hasStar).forEach(employee => {
```

והחלף ב:

```ts
  // Pass 4: Fill with non-starred employees (one per day), least-recently-
  // loaded first so shifts don't pile on whoever the array happens to list first.
  employees
    .filter(emp => !emp.hasStar)
    .sort((a, b) => (recentLoad.get(a.name) ?? 0) - (recentLoad.get(b.name) ?? 0))
    .forEach(employee => {
```

- [ ] **Step 7: הרצת הבדיקות לוודא הצלחה**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: PASS - כל הבדיקות, כולל 3 החדשות ו-9 הקיימות ללא שינוי בתוצאה.

- [ ] **Step 8: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm run build`
Expected: הכל ירוק, ללא אזהרות lint חדשות.

- [ ] **Step 9: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "$(cat <<'EOF'
feat: שילוב עומס-עבר בשלבי הבחירה של generateWeeklySchedule

leastLoaded (שלבים 5-6), סדר-מיון בשלב 4, ושבירת-תיקו בשלב 2 מתחשבים
עכשיו בעומס מ-calculateRecentLoad, בנוסף לעומס בתוך השבוע הנוכחי.
פרמטר savedSchedules אופציונלי - קריאות בלעדיו זהות להתנהגות הקודמת.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: חיבור ב-`Index.tsx` ואימות סופי

**Files:**
- Modify: `src/pages/Index.tsx:523`

**Interfaces:**
- Consumes: `generateWeeklySchedule(..., savedSchedules?: SavedSchedule[])` מ-Task 3. `savedSchedules` כבר קיים כ-state בקומפוננטה (שורה 188).

- [ ] **Step 1: עדכון קריאת `generateWeeklySchedule`**

ב-`src/pages/Index.tsx`, שורה 523, מצא:

```ts
    const newSchedule = generateWeeklySchedule(employees, stations, weekStart, activeDays, baseSchedule ?? undefined, lockedCells);
```

והחלף ב:

```ts
    const newSchedule = generateWeeklySchedule(employees, stations, weekStart, activeDays, baseSchedule ?? undefined, lockedCells, savedSchedules);
```

- [ ] **Step 2: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm run build`
Expected: הכל ירוק, ללא אזהרות חדשות. אין בדיקת unit ייעודית ל-`Index.tsx` (עקבי עם שאר הפרויקט - הקומפוננטה לא נבדקת ב-unit tests) - האימות כאן הוא type-check + build.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "$(cat <<'EOF'
feat: חיבור savedSchedules לאלגוריתם השיבוץ - הוגנות בין-שבועית חיה

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
