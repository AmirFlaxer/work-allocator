# Max Daily Shifts Per Employee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the employee boolean "אפשר שיבוץ למספר עמדות ביום" with a numeric "מספר שיבוצים ביום" (default 1) that caps how many shifts an employee can get per day, applied only as a last resort by the auto-scheduler.

**Architecture:** Add `maxDailyShifts?: number` to `Employee`, keeping the old `canWorkMultipleStations?: boolean` as a deprecated read-only field for backward compatibility. A single shared helper `dailyShiftCap(emp)` resolves the effective cap from both fields. The scheduler's per-day `employeeAssignments` map changes from boolean to a count; passes 1-5 still enforce one-shift-per-day, and pass 6 (last resort) fills remaining empty slots up to each employee's cap. The manual cell editor blocks at the cap instead of at any second same-day assignment.

**Tech Stack:** React 18 + TypeScript + Vite + Shadcn/UI, Hebrew RTL. No test runner installed; verification per task is `npm run build` (TS typecheck) + `npm run lint`, plus a throwaway `npx tsx` script for the scheduler logic.

## Global Constraints

- Hebrew-only UI copy. Regular hyphen ( - ) never em/en-dashes. No arrows in Hebrew text (they flip under RTL).
- Default `maxDailyShifts`: 1 (when undefined). Minimum 1.
- Backward compatibility (read-time, no active migration): old employees still hold `canWorkMultipleStations`. The cap is `emp.maxDailyShifts ?? (emp.canWorkMultipleStations ? 2 : 1)`, always via the shared `dailyShiftCap(emp)` helper. Consumers must NOT read the raw fields directly.
- Keep `canWorkMultipleStations?: boolean` in the `Employee` type, marked deprecated. New code never writes it.
- Weekly cap (`maxWeeklyShifts`) keeps counting DAYS, not total shifts - unchanged. `getAssignedCount` counts days where the employee has >= 1 shift.
- Scheduler semantics: "last resort only" - passes 1-5 stay one-shift-per-day for everyone; only pass 6 uses the daily cap to add extra shifts.
- No test runner installed; verification is `npm run build` + `npm run lint`. Lint baseline is 2 pre-existing errors + 7 pre-existing warnings - flag/introduce no NEW lint issues.

---

## File Structure

- **Modify** `src/types/employee.ts` - add `maxDailyShifts?: number`; mark `canWorkMultipleStations` deprecated.
- **Modify** `src/lib/week.ts` - add the pure helper `dailyShiftCap(emp)` (lives beside `stationSlots`; shared by scheduler + components).
- **Modify** `src/lib/scheduler.ts` - `employeeAssignments` becomes a count; pass 6 uses `dailyShiftCap`.
- **Modify** `src/components/EmployeeForm.tsx` - number input replaces the checkbox.
- **Modify** `src/components/EmployeeList.tsx` - badge text via `dailyShiftCap`.
- **Modify** `src/pages/Index.tsx` - `handleCellEdit` blocks at the daily cap.

---

## Task 1: Type field + `dailyShiftCap` helper

**Files:**
- Modify: `src/types/employee.ts`
- Modify: `src/lib/week.ts`

**Interfaces:**
- Produces: `Employee.maxDailyShifts?: number`; `dailyShiftCap(employee: Employee): number` exported from `src/lib/week.ts`.

- [ ] **Step 1: Add the type field**

In `src/types/employee.ts`, in the `Employee` interface, replace the line:

```typescript
  canWorkMultipleStations?: boolean;
```

with:

```typescript
  /** @deprecated use maxDailyShifts. Kept for backward-compat reads of old data. */
  canWorkMultipleStations?: boolean;
  maxDailyShifts?: number;
```

- [ ] **Step 2: Add the `dailyShiftCap` helper to week.ts**

In `src/lib/week.ts`, update the type import at the top to include `Employee`:

```typescript
import { Station, Cell, Employee } from "@/types/employee";
```

Then add this function next to `stationSlots`:

```typescript
// How many shifts an employee may work in a single day (default 1).
// Reads maxDailyShifts, falling back to the legacy canWorkMultipleStations flag.
export function dailyShiftCap(employee: Employee): number {
  if (employee.maxDailyShifts != null) return Math.max(1, employee.maxDailyShifts);
  return employee.canWorkMultipleStations ? 2 : 1;
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: build PASS, lint stays at the 2-error/7-warning baseline (no new issues). The helper is not consumed yet; nothing else changes.

- [ ] **Step 4: Commit**

```bash
git add src/types/employee.ts src/lib/week.ts
git commit -m "feat: add maxDailyShifts field + dailyShiftCap helper"
```

---

## Task 2: Scheduler uses a per-day count + daily cap

**Files:**
- Modify: `src/lib/scheduler.ts`

**Interfaces:**
- Consumes: `dailyShiftCap` from `src/lib/week.ts`.
- After this task, behavior at default (cap 1) is identical to before; employees with cap >= 2 (or legacy `canWorkMultipleStations: true`, which maps to 2) can receive extra same-day shifts only via pass 6.

- [ ] **Step 1: Import the helper**

In `src/lib/scheduler.ts`, change the week import line:

```typescript
import { getWeekDays, cellNames, stationSlots, cellKey, dailyShiftCap } from "@/lib/week";
```

- [ ] **Step 2: Change `employeeAssignments` to a count**

Replace the block that declares and initializes `employeeAssignments` (currently a boolean map):

```typescript
  // Track one-shift-per-day per employee.
  const employeeAssignments: { [employeeId: string]: { [date: string]: boolean } } = {};
  employees.forEach(emp => {
    employeeAssignments[emp.id] = {};
    weekDays.forEach(date => {
      employeeAssignments[emp.id][date] = stations.some(st =>
        slotArr(date, st.id).includes(emp.name)
      );
    });
  });
```

with a numeric count (how many shifts the employee already has that day):

```typescript
  // Track how many shifts each employee has per day (0 = none).
  const employeeAssignments: { [employeeId: string]: { [date: string]: number } } = {};
  employees.forEach(emp => {
    employeeAssignments[emp.id] = {};
    weekDays.forEach(date => {
      employeeAssignments[emp.id][date] = stations.filter(st =>
        slotArr(date, st.id).includes(emp.name)
      ).length;
    });
  });
```

- [ ] **Step 3: Make `getAssignedCount` count days, and `place` increment**

Replace `getAssignedCount`:

```typescript
  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(Boolean).length;
```

with (count days where the employee has >= 1 shift - keeps weekly cap = days):

```typescript
  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(c => c > 0).length;
```

Replace the `place` helper's assignment line. Change:

```typescript
  const place = (date: string, stationId: number, emp: Employee) => {
    const slot = freeSlot(date, stationId);
    if (slot < 0) return false;
    slotArr(date, stationId)[slot] = emp.name;
    employeeAssignments[emp.id][date] = true;
    return true;
  };
```

to:

```typescript
  const place = (date: string, stationId: number, emp: Employee) => {
    const slot = freeSlot(date, stationId);
    if (slot < 0) return false;
    slotArr(date, stationId)[slot] = emp.name;
    employeeAssignments[emp.id][date] += 1;
    return true;
  };
```

(The truthiness guards in passes 2/4/5 - `if (employeeAssignments[...][date])` and `!employeeAssignments[...][date]` - keep working unchanged: count 0 is falsy, >0 is truthy, so passes 1-5 still cap everyone at one shift/day.)

- [ ] **Step 4: Pass 6 uses the daily cap**

Replace the Pass 6 block:

```typescript
  // Pass 6: Last resort - allow multiple stations/day.
  weekDays.forEach(date => {
    stations.forEach(station => {
      while (freeSlot(date, station.id) >= 0) {
        const multi = employees.find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          emp.canWorkMultipleStations === true &&
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp) &&
          !slotArr(date, station.id).includes(emp.name)
        );
        if (!multi) break;
        const slot = freeSlot(date, station.id);
        slotArr(date, station.id)[slot] = multi.name;
        employeeAssignments[multi.id][date] = true;
      }
    });
  });
```

with a cap-based version:

```typescript
  // Pass 6: Last resort - allow extra shifts/day up to each employee's daily cap.
  weekDays.forEach(date => {
    stations.forEach(station => {
      while (freeSlot(date, station.id) >= 0) {
        const multi = employees.find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          employeeAssignments[emp.id][date] < dailyShiftCap(emp) &&
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp) &&
          !slotArr(date, station.id).includes(emp.name)
        );
        if (!multi) break;
        const slot = freeSlot(date, station.id);
        slotArr(date, station.id)[slot] = multi.name;
        employeeAssignments[multi.id][date] += 1;
      }
    });
  });
```

(Default cap 1: any already-assigned employee has count >= 1, so `count < 1` is false - nobody gets a second shift, exactly as before. Legacy `canWorkMultipleStations: true` resolves to cap 2.)

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: build PASS, lint baseline unchanged.

- [ ] **Step 6: Verify scheduler behavior with a throwaway script**

Create `src/__scratch_daily_check.ts`:

```typescript
import { generateWeeklySchedule } from "@/lib/scheduler";
import { cellNames } from "@/lib/week";
import { Employee, Station } from "@/types/employee";

const stations: Station[] = [
  { id: 1, name: "א", requiredCount: 1 },
  { id: 2, name: "ב", requiredCount: 1 },
];
// One employee, cap 2, max 3 days/week, and a legacy-flag employee (maps to 2).
const employees: Employee[] = [
  { id: "e1", name: "רב", availableStations: [], hasStar: false, minWeeklyShifts: 0, maxWeeklyShifts: 3, maxDailyShifts: 2 },
  { id: "e2", name: "ישן", availableStations: [], hasStar: false, minWeeklyShifts: 0, canWorkMultipleStations: true },
  { id: "e3", name: "רגיל", availableStations: [], hasStar: false, minWeeklyShifts: 0 },
];
const schedule = generateWeeklySchedule(employees, stations, new Date("2026-06-28"), [0, 1, 2, 3, 4]);
let ok = true;
for (const date of Object.keys(schedule).sort()) {
  const names = [1, 2].flatMap(id => cellNames(schedule[date][id]).filter(Boolean));
  const countRav = names.filter(n => n === "רב").length;
  const countRagil = names.filter(n => n === "רגיל").length;
  if (countRav > 2) { ok = false; console.log(`FAIL ${date}: רב has ${countRav} (cap 2)`); }
  if (countRagil > 1) { ok = false; console.log(`FAIL ${date}: רגיל has ${countRagil} (cap 1)`); }
  console.log(`${date}: ${JSON.stringify(names)}`);
}
const ravDays = Object.values(schedule).filter(day => [1,2].some(id => cellNames(day[id]).includes("רב"))).length;
if (ravDays > 3) { ok = false; console.log(`FAIL: רב worked ${ravDays} days (maxWeekly 3)`); }
console.log(ok ? "RESULT: PASS - daily caps + weekly cap respected" : "RESULT: FAIL");
```

Run: `npx tsx src/__scratch_daily_check.ts`
Expected: ends with `RESULT: PASS`. "רגיל" (default cap 1) never appears twice in a day; "רב" never exceeds 2/day and never exceeds 3 days/week.

Then delete it: `rm -f src/__scratch_daily_check.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/scheduler.ts
git commit -m "feat: scheduler caps daily shifts via dailyShiftCap (last resort)"
```

---

## Task 3: EmployeeForm number input

**Files:**
- Modify: `src/components/EmployeeForm.tsx`

**Interfaces:**
- Consumes: `Employee.maxDailyShifts`.
- After this task, saving an employee writes `maxDailyShifts` and no longer writes `canWorkMultipleStations`.

- [ ] **Step 1: Replace the state hook**

In `src/components/EmployeeForm.tsx`, replace:

```typescript
  const [canWorkMultipleStations, setCanWorkMultipleStations] = useState(
    employee?.canWorkMultipleStations ?? false
  );
```

with:

```typescript
  const [maxDailyShifts, setMaxDailyShifts] = useState<number>(
    employee?.maxDailyShifts ?? (employee?.canWorkMultipleStations ? 2 : 1)
  );
```

- [ ] **Step 2: Replace the onSave field**

In the `onSave({ ... })` object inside `handleSubmit`, replace the line:

```typescript
      canWorkMultipleStations,
```

with:

```typescript
      maxDailyShifts: Math.max(1, maxDailyShifts),
```

- [ ] **Step 3: Replace the checkbox UI with a number input**

Replace the entire "Multiple stations" block:

```tsx
        {/* Multiple stations */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox
            id="canWorkMultiple"
            checked={canWorkMultipleStations}
            onCheckedChange={checked => setCanWorkMultipleStations(checked as boolean)}
          />
          <Label htmlFor="canWorkMultiple" className="cursor-pointer">
            אפשר שיבוץ למספר עמדות ביום
          </Label>
        </div>
```

with:

```tsx
        {/* Max daily shifts */}
        <div className="space-y-2">
          <Label htmlFor="maxDailyShifts">מספר שיבוצים ביום</Label>
          <Input
            id="maxDailyShifts"
            type="number"
            min={1}
            value={maxDailyShifts}
            onChange={e => setMaxDailyShifts(parseInt(e.target.value) || 1)}
            className="w-32"
          />
        </div>
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: build PASS, lint baseline unchanged. (If `Checkbox` becomes unused it would be a NEW lint warning - it is still used for the "hasStar" and per-station checkboxes, so it stays imported. Confirm no new warnings.)

- [ ] **Step 5: Commit**

```bash
git add src/components/EmployeeForm.tsx
git commit -m "feat: max daily shifts number input in employee form"
```

---

## Task 4: EmployeeList badge + manual-edit cap

**Files:**
- Modify: `src/components/EmployeeList.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `dailyShiftCap` from `src/lib/week.ts`.

- [ ] **Step 1: Update the EmployeeList badge**

In `src/components/EmployeeList.tsx`, add the import:

```typescript
import { dailyShiftCap } from "@/lib/week";
```

Replace the footer block:

```tsx
              {/* Footer */}
              {employee.canWorkMultipleStations && (
                <div className="mt-2.5 pt-2 border-t border-border/50">
                  <Badge variant="outline" className="text-xs gap-1 rounded-md">
                    <Layers className="h-3 w-3" />
                    יכול לעבוד במספר עמדות
                  </Badge>
                </div>
              )}
```

with:

```tsx
              {/* Footer */}
              {dailyShiftCap(employee) > 1 && (
                <div className="mt-2.5 pt-2 border-t border-border/50">
                  <Badge variant="outline" className="text-xs gap-1 rounded-md">
                    <Layers className="h-3 w-3" />
                    עד {dailyShiftCap(employee)} שיבוצים ביום
                  </Badge>
                </div>
              )}
```

- [ ] **Step 2: Update the manual-edit guard in Index**

In `src/pages/Index.tsx`, add `dailyShiftCap` to the existing `@/lib/week` import (it currently imports e.g. `getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS, ALL_HEBREW_DAYS, cellNames, stationSlots, cellKey`):

```typescript
import { getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS, ALL_HEBREW_DAYS, cellNames, stationSlots, cellKey, dailyShiftCap } from "@/lib/week";
```

(Match the existing import - add `dailyShiftCap` to whatever the current list is; do not drop existing names.)

Then in `handleCellEdit`, replace the double-assignment block:

```typescript
      // Block double-assignment on same day (any station, any slot, excluding this slot).
      const alreadyThisDay = stations.some(st =>
        cellNames(schedule[date]?.[st.id]).some((n, i) =>
          n === employeeName && !(st.id === stationId && i === slotIndex)
        )
      );
      if (alreadyThisDay) {
        toast({ title: "שיבוץ כפול", description: `${employeeName} כבר משובץ/ת ביום זה בעמדה אחרת`, variant: "destructive" });
        return;
      }
      const employee = employees.find(e => e.name === employeeName);
```

with a cap-based block:

```typescript
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
```

(The existing `if (employee?.maxWeeklyShifts != null) { ... }` block that follows stays unchanged - it now reuses the `employee` const declared above.)

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: build PASS, lint baseline unchanged.

- [ ] **Step 4: Manual verification**

`npm run dev`. Then:
1. Edit an employee - the form shows a "מספר שיבוצים ביום" number field (default 1) instead of the old checkbox. Set it to 2, save.
2. In the employee card, a "עד 2 שיבוצים ביום" badge appears.
3. In the schedule, manually assign that employee to two different stations on the same day - both succeed. A third same-day assignment is blocked with "מקסימום שיבוצים ביום".
4. A default employee (cap 1) is still blocked on the second same-day assignment.

- [ ] **Step 5: Commit**

```bash
git add src/components/EmployeeList.tsx src/pages/Index.tsx
git commit -m "feat: apply daily shift cap to employee badge and manual edit"
```

---

## Self-Review Notes (resolved)

- **Spec coverage:** type + helper (Task 1), scheduler count/cap (Task 2), form input (Task 3), list badge + manual-edit cap (Task 4). Backward compat via `dailyShiftCap` reading both fields (Task 1, used everywhere). Weekly cap stays day-based (Task 2 `getAssignedCount`).
- **Deviation from spec:** the spec placed `dailyShiftCap` in `scheduler.ts`; the plan puts it in `week.ts` instead, beside `stationSlots`, because it is a pure employee helper already imported by every consumer (scheduler, Index, EmployeeList) - avoids components importing from `scheduler.ts`. Same signature and semantics.
- **Type consistency:** `dailyShiftCap(employee: Employee): number` defined once (Task 1) and consumed identically in Tasks 2/4. `employeeAssignments` is a number map consistently after Task 2.
- **Placeholder scan:** none; every code step shows full code.
