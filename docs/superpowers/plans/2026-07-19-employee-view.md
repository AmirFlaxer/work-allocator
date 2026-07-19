# תצוגה הפוכה לפי עובדים - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מתג "תצוגה לפי עובדים" שמחליף את טבלת השיבוץ בטבלה הפוכה לצפייה/הדפסה - שורות עובדים, עמודות ימים, תאי עמדות + עמודת סה"כ.

**Architecture:** לוגיקה טהורה `buildEmployeeViewRows` ב-lib (נבדקת ב-vitest) + קומפוננטת-תצוגה חדשה + state בדפוס cellColors ב-Index. התצוגה מתרנדרת בתוך `#schedule-table` כך ש-PNG/הדפסה תופסים אותה.

**Tech Stack:** React 18 + TS, vitest, shadcn/ui (Switch, Table).

**Spec:** `docs/superpowers/specs/2026-07-19-employee-view-design.md`

## Global Constraints

- עברית ב-UI, מקף רגיל ( - ), בלי חצים.
- **branch:** `feat/employee-view` בתיקיית הפרויקט הראשית. בדיקת branch בפתיחת כל משימה.
- שערים: `npx tsc --noEmit && npm test && npm run lint` (baseline 8 אזהרות) `&& npm run build`.
- צפייה בלבד - אפס אינטראקציות עריכה בתצוגה ההפוכה.

---

### Task 1: לוגיקה טהורה (TDD) - `src/lib/employeeView.ts`

**Files:**
- Create: `src/lib/employeeView.ts`
- Test: `src/lib/employeeView.test.ts`

**Interfaces:**
- Produces (למשימה 2): `EmployeeViewRow { name: string; stationsPerDay: string[][]; total: number }` · `buildEmployeeViewRows(employees: Employee[], stations: Station[], schedule: WeeklySchedule, weekDays: string[]): EmployeeViewRow[]`.

- [ ] **Step 1: בדיקות נכשלות** - `src/lib/employeeView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { buildEmployeeViewRows } from "./employeeView";

const emp = (id: string, name: string): Employee =>
  ({ id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0 });
const st = (id: number, name: string): Station => ({ id, name });

const DAYS = ["2026-07-19", "2026-07-20"];

describe("buildEmployeeViewRows", () => {
  it("בונה שורה לכל עובד לפי סדר הרשימה, כולל עובד בלי משמרות", () => {
    const employees = [emp("a", "אבי"), emp("b", "בני")];
    const stations = [st(1, "דלפק")];
    const schedule: WeeklySchedule = {
      [DAYS[0]]: { 1: ["אבי"] },
      [DAYS[1]]: { 1: ["אבי"] },
    };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows.map(r => r.name)).toEqual(["אבי", "בני"]);
    expect(rows[0].stationsPerDay).toEqual([["דלפק"], ["דלפק"]]);
    expect(rows[0].total).toBe(2);
    expect(rows[1].stationsPerDay).toEqual([[], []]);
    expect(rows[1].total).toBe(0);
  });

  it("עובד בשתי עמדות באותו יום - שתי העמדות בתא, total סופר ימים ולא משמרות", () => {
    const employees = [emp("a", "אבי")];
    const stations = [st(1, "דלפק"), st(2, "מחסן")];
    const schedule: WeeklySchedule = {
      [DAYS[0]]: { 1: ["אבי"], 2: ["אבי"] },
      [DAYS[1]]: {},
    };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows[0].stationsPerDay[0]).toEqual(["דלפק", "מחסן"]);
    expect(rows[0].total).toBe(1);
  });

  it("תא רב-משבצות (requiredCount>1) - העובד מזוהה גם כשהוא לא ראשון בתא", () => {
    const employees = [emp("b", "בני")];
    const stations = [st(1, "דלפק")];
    const schedule: WeeklySchedule = { [DAYS[0]]: { 1: ["אבי", "בני"] }, [DAYS[1]]: {} };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows[0].stationsPerDay[0]).toEqual(["דלפק"]);
  });

  it("יום שחסר ב-schedule נספר כריק", () => {
    const employees = [emp("a", "אבי")];
    const rows = buildEmployeeViewRows(employees, [st(1, "דלפק")], {}, DAYS);
    expect(rows[0].stationsPerDay).toEqual([[], []]);
  });
});
```

- [ ] **Step 2: לוודא כישלון** - `npm test -- employeeView` - FAIL על import חסר.

- [ ] **Step 3: מימוש** - `src/lib/employeeView.ts`:

```ts
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { cellNames } from "@/lib/week";

/** שורת עובד בתצוגה ההפוכה: העמדות שלו בכל יום + סה"כ ימי-עבודה בשבוע. */
export interface EmployeeViewRow {
  name: string;
  /** לכל יום (לפי סדר weekDays): שמות העמדות שהעובד משובץ בהן */
  stationsPerDay: string[][];
  total: number;
}

/**
 * בונה את מודל התצוגה-לפי-עובדים. התאמה לפי שם - מוסכמת המודל הקיימת
 * (תאי השיבוץ שומרים שמות; ראו viewerShifts ב-share.ts).
 */
export function buildEmployeeViewRows(
  employees: Employee[],
  stations: Station[],
  schedule: WeeklySchedule,
  weekDays: string[],
): EmployeeViewRow[] {
  return employees.map(empItem => {
    const stationsPerDay = weekDays.map(date =>
      stations
        .filter(station => cellNames(schedule[date]?.[station.id]).includes(empItem.name))
        .map(station => station.name)
    );
    const total = stationsPerDay.filter(day => day.length > 0).length;
    return { name: empItem.name, stationsPerDay, total };
  });
}
```

- [ ] **Step 4: לוודא הצלחה** - `npm test -- employeeView` PASS, ואז `npx tsc --noEmit && npm test` מלא (80 בדיקות).

- [ ] **Step 5: Commit** - `git add src/lib/employeeView.ts src/lib/employeeView.test.ts && git commit -m "feat: לוגיקת תצוגה-לפי-עובדים - buildEmployeeViewRows עם בדיקות"`

---

### Task 2: קומפוננטה + חיווט ב-Index

**Files:**
- Create: `src/components/EmployeeScheduleView.tsx`
- Modify: `src/pages/Index.tsx` (state בדפוס cellColors + Switch + רינדור מותנה בתוך `#schedule-table`)

**Interfaces:**
- Consumes: `buildEmployeeViewRows`, `EmployeeViewRow` (Task 1) · `getWeekDays`, `getHebrewDayLabels`, `parseISODate` (week.ts) · `getEmployeeColor` (employeeColors.ts - לקרוא את החתימה לפני שימוש).

- [ ] **Step 1: `src/components/EmployeeScheduleView.tsx`**

```tsx
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildEmployeeViewRows } from "@/lib/employeeView";
import { getWeekDays, getHebrewDayLabels, parseISODate } from "@/lib/week";
import { getEmployeeColor } from "@/lib/employeeColors";

interface EmployeeScheduleViewProps {
  employees: Employee[];
  stations: Station[];
  schedule: WeeklySchedule;
  weekStart: Date;
  activeDays: number[];
  darkMode: boolean;
}

// תצוגה הפוכה לצפייה/הדפסה: שורות = עובדים, עמודות = ימים, תא = עמדות היום.
// צפייה בלבד - העריכה נשארת בתצוגה הרגילה.
export function EmployeeScheduleView({ employees, stations, schedule, weekStart, activeDays, darkMode }: EmployeeScheduleViewProps) {
  const weekDays = getWeekDays(weekStart, activeDays);
  const labels = getHebrewDayLabels(activeDays);
  const rows = buildEmployeeViewRows(employees, stations, schedule, weekDays);

  return (
    <div className="rounded-xl border border-border overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right font-bold">עובד</TableHead>
            {weekDays.map((date, i) => (
              <TableHead key={date} className="text-center">
                <div className="font-bold">{labels[i]}</div>
                <div className="text-xs text-muted-foreground">
                  {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                </div>
              </TableHead>
            ))}
            <TableHead className="text-center font-bold">סה"כ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={weekDays.length + 2} className="text-center text-muted-foreground py-6">
                אין עובדים עדיין
              </TableCell>
            </TableRow>
          ) : rows.map(row => (
            <TableRow key={row.name} className="hover:bg-accent/30">
              <TableCell className="font-medium whitespace-nowrap">
                <span
                  className="inline-block w-2 h-2 rounded-full ml-1.5"
                  style={{ background: getEmployeeColor(row.name, darkMode).accent }}
                />
                {row.name}
              </TableCell>
              {row.stationsPerDay.map((dayStations, i) => (
                <TableCell key={weekDays[i]} className="text-center text-sm">
                  {dayStations.length > 0
                    ? dayStations.join(", ")
                    : <span className="text-muted-foreground/40">-</span>}
                </TableCell>
              ))}
              <TableCell className="text-center font-semibold">{row.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

לפני הקומיט: לקרוא את `src/lib/employeeColors.ts` ולוודא שהחתימה `getEmployeeColor(name, darkMode).accent` נכונה (כך היא משומשת ב-ScheduleTable) - להתאים אם שונה.

- [ ] **Step 2: state ב-Index בדפוס cellColors המדויק**

ב-`src/pages/Index.tsx` (לקרוא את אזורי cellColors לפני עריכה):

1. state (ליד cellColors, ~שורה 111): `const [employeeView, setEmployeeView] = useState<boolean>(() => localStorage.getItem("employeeView") === "true");`
2. persist effect (ליד המקביל, ~שורה 330): `useEffect(() => { localStorage.setItem("employeeView", String(employeeView)); syncToSupabase("employeeView", employeeView); }, [employeeView, syncToSupabase]);`
3. טעינה מ-store (~שורה 364): `if (store.employeeView !== undefined) setEmployeeView(store.employeeView as boolean);`
4. realtime (~שורה 398): `else if (key === "employeeView") setEmployeeView(value as boolean);`
5. להוסיף `"employeeView"` לרשימת המפתחות בשורה ~79 (המערך שמכיל "cellColors").

- [ ] **Step 3: Switch + רינדור מותנה**

1. Switch ליד "צבע לעובד" (~שורה 1299):

```tsx
                  <div className="flex items-center gap-2">
                    <Switch id="employee-view" checked={employeeView} onCheckedChange={setEmployeeView} />
                    <Label htmlFor="employee-view" className="text-sm cursor-pointer text-muted-foreground">תצוגה לפי עובדים</Label>
                  </div>
```

2. import הקומפוננטה, ובתוך המכל עם `id="schedule-table"` (לאתר אותו - עוטף את ScheduleTable): רינדור מותנה -

```tsx
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
                  <ScheduleTable ... הקיים ... />
                )}
```

(לשמר את כל ה-props הקיימים של ScheduleTable כמו-שהם; רק לעטוף בתנאי. לוודא שהמתג "צבע לעובד" מוצג רק בתצוגה הרגילה או נשאר תמיד - להשאיר תמיד, לא מזיק.)

- [ ] **Step 4: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build` - ירוק, בלי אזהרות חדשות.

- [ ] **Step 5: Commit** - `git add src/components/EmployeeScheduleView.tsx src/pages/Index.tsx && git commit -m "feat: מתג תצוגה-לפי-עובדים בטבלת השיבוץ"`

---

### Task 3: מדריך (md+PDF)

- [ ] בסוף סעיף "### הטבלה" בפרק "לשונית השיבוץ" ב-`public/user-guide.md` להוסיף:

```markdown
מתג "תצוגה לפי עובדים" הופך את הטבלה: שורה לכל עובד, עמודה לכל יום, ובכל תא העמדות של אותו עובד - נוח להדפסה ולתלייה בחדר הצוות. התצוגה הזו לצפייה בלבד; עריכה נעשית בתצוגה הרגילה.
```

- [ ] PDF מחדש (התהליך הרגיל), אימות ויזואלי, commit: `docs: מדריך משתמש - תצוגה לפי עובדים`

---

### Task 4: אינטגרציה (מתזמר)

- [ ] סקירת-ענף (Sonnet), מיזוג ff, push, פריסה ירוקה.
- [ ] אימות חי (Playwright + חשבון-בדיקה): מתג מחליף תצוגה, שורות-עובדים נכונות, PNG מייצא את התצוגה ההפוכה, ניקוי.
- [ ] עדכון memory.

## Self-Review (בוצע)

- כיסוי spec מלא; שמות עקביים (`buildEmployeeViewRows`, `EmployeeViewRow`, `employeeView` key); אין placeholders (ה-"..." ב-ScheduleTable מציין במפורש "לשמר props קיימים", לא קוד חסר - המיישם קורא את הקובץ).
