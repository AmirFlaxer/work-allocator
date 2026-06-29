# Work Days + Per-Station Staffing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose which weekdays count as a work week (default Sun-Thu), and set how many employees each station needs simultaneously (default 1).

**Architecture:** Centralize all duplicated week-day and cell-reading logic into a new `src/lib/week.ts` module. Phase 1 adds an `activeDays` setting threaded to every consumer. Phase 2 changes each schedule cell from a single `string` to `string[]` (one entry per required slot), read everywhere through a tolerant `cellNames()` helper that also accepts legacy `string` values for backward compatibility.

**Tech Stack:** React 18 + TypeScript + Vite + Shadcn/UI + Tailwind. No test runner is installed; verification per task is `npm run build` (TypeScript typecheck), `npm run lint`, and concrete manual checks in `npm run dev`.

## Global Constraints

- Hebrew-only UI copy. Use a regular hyphen ( - ), never em/en-dashes. Never use arrows (→ ← etc.) in Hebrew text - they flip under RTL.
- `weekStart` is always anchored to Sunday elsewhere in the app; `getWeekDays` must tolerate a non-Sunday `weekStart` by anchoring to the Sunday of its week.
- Default active days: `[0,1,2,3,4]` (Sun-Thu). At least one day must always stay selected.
- Default station `requiredCount`: 1 (when the field is `undefined`).
- Backward compatibility: existing saved schedules and the current schedule store cells as `string`. All reads go through `cellNames()`, which accepts `string | string[] | undefined`. No active data migration.
- Sync pattern: every synced state key persists to localStorage + Supabase, is loaded on mount, handled in the realtime subscription, reset on empty-org, and listed in `LOCAL_KEYS`. New synced key `activeDays` must touch all six of those spots (mirror `cellColors` exactly).

---

## File Structure

- **Create** `src/lib/week.ts` - all week-day + cell-reading helpers (single source of truth).
- **Modify** `src/types/employee.ts` - `Station.requiredCount?`, `WeeklySchedule` cell type becomes `Cell = string | string[]`.
- **Modify** `src/lib/scheduler.ts` - slot-aware generation; re-export-free, imports from `week.ts`.
- **Modify** `src/pages/Index.tsx` - `activeDays` state+sync, thread `activeDays`, per-slot handlers, read via `cellNames`.
- **Modify** `src/components/ScheduleTable.tsx` - active-day columns; multi-row-per-station rendering with per-slot keys.
- **Modify** `src/components/StationManager.tsx` - `requiredCount` number input.
- **Modify** `src/components/WeeklyPreferences.tsx` - active-day rows.
- **Modify** `src/components/ScheduleChanges.tsx` - per-slot diff via `cellNames`.
- **Modify** `src/components/MonthlyReport.tsx` - read cells via `cellNames`.
- **Modify** `src/components/EmployeeList.tsx` - shift count via `cellNames`.

---

# PHASE 1 - Configurable work days

## Task 1: Create the `week.ts` module (day helpers)

**Files:**
- Create: `src/lib/week.ts`

**Interfaces:**
- Produces: `ALL_HEBREW_DAYS: string[]`, `DEFAULT_ACTIVE_DAYS: number[]`, `getWeekDays(weekStart: Date, activeDays: number[]): string[]`, `getHebrewDayLabels(activeDays: number[]): string[]`.

- [ ] **Step 1: Create the module with day helpers**

Create `src/lib/week.ts`:

```typescript
// Single source of truth for week-day logic (was duplicated across 4 files).

export const ALL_HEBREW_DAYS = [
  "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת",
];

export const DEFAULT_ACTIVE_DAYS = [0, 1, 2, 3, 4]; // א-ה

// Normalize active days: sorted ascending, deduped, only valid 0-6.
function normalizeActiveDays(activeDays: number[]): number[] {
  const valid = (activeDays ?? []).filter(d => d >= 0 && d <= 6);
  const unique = Array.from(new Set(valid));
  return unique.length > 0 ? unique.sort((a, b) => a - b) : [...DEFAULT_ACTIVE_DAYS];
}

// Anchor to the Sunday of weekStart's week, then return one ISO date per active
// weekday. Tolerates a weekStart that is not exactly Sunday.
export function getWeekDays(weekStart: Date, activeDays: number[]): string[] {
  const sunday = new Date(weekStart);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return normalizeActiveDays(activeDays).map(weekday => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + weekday);
    return d.toISOString().split("T")[0];
  });
}

// Hebrew labels for the active days, in the same order as getWeekDays.
export function getHebrewDayLabels(activeDays: number[]): string[] {
  return normalizeActiveDays(activeDays).map(weekday => ALL_HEBREW_DAYS[weekday]);
}
```

- [ ] **Step 2: Verify build and lint pass**

Run: `npm run build && npm run lint`
Expected: PASS, no errors. The module is not yet imported anywhere, so nothing else changes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/week.ts
git commit -m "feat: add week.ts module with configurable work-day helpers"
```

---

## Task 2: Thread `activeDays` everywhere + add the selector UI

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/lib/scheduler.ts`
- Modify: `src/components/ScheduleTable.tsx`
- Modify: `src/components/WeeklyPreferences.tsx`
- Modify: `src/components/ScheduleChanges.tsx`

**Interfaces:**
- Consumes: `getWeekDays`, `getHebrewDayLabels`, `DEFAULT_ACTIVE_DAYS`, `ALL_HEBREW_DAYS` from `src/lib/week.ts`.
- Produces: new prop `activeDays: number[]` on `ScheduleTable`, `WeeklyPreferences`, `ScheduleChanges`; new param on `generateWeeklySchedule(employees, stations, weekStart, activeDays, baseSchedule?, lockedCells?)`.

- [ ] **Step 1: Add `activeDays` param to the scheduler**

In `src/lib/scheduler.ts`, replace the top imports and `generateWeeklySchedule` signature + its `getWeekDays` usage. Change the import line:

```typescript
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays } from "@/lib/week";
```

Change the signature and first body line:

```typescript
export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>
): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  const weekDays = getWeekDays(weekStart, activeDays);
```

Then DELETE the local `getWeekDays` function (the `Array.from({ length: 5 }...)` block near the bottom of the file). Keep `countFilledSlots`, `countTotalSlots`, `calculateWorkloads`, and `cellKey` unchanged for now.

- [ ] **Step 2: Add `activeDays` prop to ScheduleTable**

In `src/components/ScheduleTable.tsx`:
- Add import: `import { getWeekDays, getHebrewDayLabels } from "@/lib/week";`
- DELETE the local `getWeekDays` function and the `const HEBREW_DAYS = [...]` constant.
- Add `activeDays: number[];` to `ScheduleTableProps`.
- Destructure `activeDays` in the component params.
- Replace the two derived lines:

```typescript
  const weekDays = getWeekDays(weekStart, activeDays);
  const hebrewDays = getHebrewDayLabels(activeDays);
```

- Replace every reference to `hebrewDaysReversed` with `hebrewDays` (it appears in the header `hebrewDays[idx]` and in `employeeWeekShifts` as `hebrewDays[weekDays.indexOf(date)]`).

- [ ] **Step 3: Add `activeDays` prop to WeeklyPreferences**

In `src/components/WeeklyPreferences.tsx`:
- Add import: `import { getWeekDays, getHebrewDayLabels } from "@/lib/week";`
- DELETE the local `getWeekDays` function and `const HEBREW_DAYS = [...]`.
- Add `activeDays: number[];` to `WeeklyPreferencesProps`, destructure it.
- Replace `const weekDays = getWeekDays(weekStart);` with:

```typescript
  const weekDays = getWeekDays(weekStart, activeDays);
  const hebrewDays = getHebrewDayLabels(activeDays);
```

- Replace both `HEBREW_DAYS[idx]` usages (unavailable-days list and specific-requests list) with `hebrewDays[idx]`.
- In the summary line `שבוע: ... עד ...`, replace `weekDays[4]` with `weekDays[weekDays.length - 1]`.

- [ ] **Step 4: Make ScheduleChanges iterate active days**

In `src/components/ScheduleChanges.tsx`:
- Add import: `import { getWeekDays } from "@/lib/week";`
- Add `activeDays: number[];` to `ScheduleChangesProps`, destructure it.
- Replace `Object.keys(currentSchedule).forEach((date) => {` with:

```typescript
  getWeekDays(currentWeekStart, activeDays).forEach((date) => {
```

- [ ] **Step 5: Add `activeDays` state + sync in Index**

In `src/pages/Index.tsx`:
- Add imports: `import { getWeekDays, getHebrewDayLabels, DEFAULT_ACTIVE_DAYS } from "@/lib/week";`
- DELETE the local `getWeekDays` function near the top.
- Add state right after the `cellColors` state block:

```typescript
  // ── Active work days ────────────────────────────────────
  const [activeDays, setActiveDays] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("activeDays");
      return saved ? JSON.parse(saved) : DEFAULT_ACTIVE_DAYS;
    } catch { return DEFAULT_ACTIVE_DAYS; }
  });
```

- Add a persistence effect next to the other `useEffect(... syncToSupabase ...)` lines:

```typescript
  useEffect(() => { localStorage.setItem("activeDays", JSON.stringify(activeDays)); syncToSupabase("activeDays", activeDays); }, [activeDays, syncToSupabase]);
```

- In the mount-load effect, add `"activeDays"` to the `LOCAL_KEYS` array. In the empty-org branch add `setActiveDays(DEFAULT_ACTIVE_DAYS);`. In the populated branch add:

```typescript
        if (store.activeDays) setActiveDays(store.activeDays as number[]);
```

- In the realtime subscription `.on(...)` handler, add before the closing of the if-chain:

```typescript
        else if (key === "activeDays") setActiveDays(value as number[]);
```

- [ ] **Step 6: Replace all Index `getWeekDays(weekStart)` calls and thread the prop**

In `src/pages/Index.tsx`, replace every call `getWeekDays(weekStart)` with `getWeekDays(weekStart, activeDays)`. These are in: `doGenerate` (baseSchedule build), `handleCloneWeek`, `handleCellEdit` (max-shift check), `handleExportToExcel`, `handleLoadTemplate`, `workloadData` memo. Also in `handleCloneWeek` the previous-week call becomes `getWeekDays(new Date(weekStart.getTime() - 7*24*60*60*1000), activeDays)`.

Update `formatWeekRange` to use active days. Replace its body with:

```typescript
function formatWeekRange(weekStart: Date, activeDays: number[]): string {
  const days = getWeekDays(weekStart, activeDays);
  const s = new Date(days[0]).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" });
  const e = new Date(days[days.length - 1]).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return `${s} · ${e}`;
}
```

And update its call site to `formatWeekRange(weekStart, activeDays)`.

In `handleExportToExcel`, replace `const HEBREW_DAYS = [...]` with `const hebrewDays = getHebrewDayLabels(activeDays);` and use `hebrewDays` where `HEBREW_DAYS` was referenced.

Update the `generateWeeklySchedule(...)` call in `doGenerate` to pass `activeDays`:

```typescript
    const newSchedule = generateWeeklySchedule(employees, stations, weekStart, activeDays, baseSchedule ?? undefined, lockedCells);
```

Pass the new prop to the three components in JSX:

```tsx
<ScheduleTable ... activeDays={activeDays} ... />
<WeeklyPreferences ... activeDays={activeDays} />
<ScheduleChanges ... activeDays={activeDays} ... />
```

- [ ] **Step 7: Add the work-days selector card to the Stations tab**

In `src/pages/Index.tsx`, inside `<TabsContent value="stations" ...>`, ABOVE `<StationManager .../>`, add:

```tsx
            <Card className="p-4 space-y-3">
              <div>
                <h3 className="font-semibold">ימי עבודה</h3>
                <p className="text-sm text-muted-foreground">בחר אילו ימים נחשבים שבוע עבודה (ברירת מחדל: ראשון - חמישי)</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {ALL_HEBREW_DAYS.map((label, idx) => {
                  const checked = activeDays.includes(idx);
                  return (
                    <label key={idx} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setActiveDays(prev => {
                            const next = prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx];
                            return next.length === 0 ? prev : next.sort((a, b) => a - b);
                          });
                        }}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  );
                })}
              </div>
            </Card>
```

Add to the lucide/icon-independent imports at the top of Index: `import { Checkbox } from "@/components/ui/checkbox";` and add `ALL_HEBREW_DAYS` to the `week` import.

- [ ] **Step 8: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: PASS, no TypeScript errors.

- [ ] **Step 9: Manual verification**

Run: `npm run dev`. Then:
1. Go to the "עמדות" tab - the "ימי עבודה" card shows 7 checkboxes, with ראשון-חמישי checked.
2. Uncheck רביעי. Go to "שיבוץ", press "צור שיבוץ". The table shows 4 columns (א, ב, ג, ה) - no Wednesday.
3. Check שישי. The table now shows ראשון, שני, שלישי, חמישי, שישי.
4. Go to "העדפות", select an employee - the unavailable-days and specific-request rows match the active days.
5. Try to uncheck every day - the last one cannot be unchecked.

- [ ] **Step 10: Commit**

```bash
git add src/pages/Index.tsx src/lib/scheduler.ts src/components/ScheduleTable.tsx src/components/WeeklyPreferences.tsx src/components/ScheduleChanges.tsx
git commit -m "feat: configurable work days (default Sun-Thu)"
```

---

# PHASE 2 - Employees per station

## Task 3: Migrate cell model to `string[]` (no behavior change)

**Files:**
- Modify: `src/types/employee.ts`
- Modify: `src/lib/week.ts`
- Modify: `src/lib/scheduler.ts`
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/ScheduleTable.tsx`
- Modify: `src/components/ScheduleChanges.tsx`
- Modify: `src/components/MonthlyReport.tsx`
- Modify: `src/components/EmployeeList.tsx`

**Interfaces:**
- Produces: `type Cell = string | string[]`; `cellNames(cell: Cell | undefined): string[]`; `stationSlots(station: Station): number`; `cellKey(date: string, stationId: number, slotIndex: number): string` (all from `week.ts`).
- After this task every station still renders exactly 1 slot (since `requiredCount` defaults to 1), so the app behaves identically. The deliverable is "the data model is arrays, old data still loads."

- [ ] **Step 1: Update types**

In `src/types/employee.ts`:
- Add `requiredCount?: number;` to the `Station` interface.
- Replace the `WeeklySchedule` interface with:

```typescript
export type Cell = string | string[];

export interface WeeklySchedule {
  [date: string]: {
    [stationId: number]: Cell;
  };
}
```

- [ ] **Step 2: Add cell helpers to week.ts**

Append to `src/lib/week.ts`:

```typescript
import { Station, Cell } from "@/types/employee";

// Normalize a cell to an array of names. Accepts legacy string cells.
export function cellNames(cell: Cell | undefined): string[] {
  if (cell === undefined || cell === null) return [];
  return Array.isArray(cell) ? cell : [cell];
}

// How many simultaneous employees a station needs (default 1).
export function stationSlots(station: Station): number {
  return Math.max(1, station.requiredCount ?? 1);
}

// Cell identity key including the slot index.
export function cellKey(date: string, stationId: number, slotIndex: number): string {
  return `${date}__${stationId}__${slotIndex}`;
}
```

- [ ] **Step 3: Rewrite the scheduler to be slot-aware**

Replace the entire body of `src/lib/scheduler.ts` with:

```typescript
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays, cellNames, stationSlots, cellKey } from "@/lib/week";

export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>
): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  const weekDays = getWeekDays(weekStart, activeDays);

  // Initialize slot arrays - preserve locked slots from baseSchedule.
  weekDays.forEach(date => {
    schedule[date] = {};
    stations.forEach(station => {
      const n = stationSlots(station);
      const base = cellNames(baseSchedule?.[date]?.[station.id]);
      const arr: string[] = [];
      for (let i = 0; i < n; i++) {
        const locked = lockedCells?.has(cellKey(date, station.id, i)) && base[i];
        arr[i] = locked ? base[i] : "";
      }
      schedule[date][station.id] = arr;
    });
  });

  const slotArr = (date: string, stationId: number) => schedule[date][stationId] as string[];

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

  const availableStationsFor = (emp: Employee) =>
    (emp.availableStations?.length ?? 0) === 0
      ? stations.map(s => s.id)
      : emp.availableStations;

  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(Boolean).length;

  const reachedMax = (emp: Employee) => {
    if (emp.maxWeeklyShifts === undefined || emp.maxWeeklyShifts === null) return false;
    return getAssignedCount(emp.id) >= emp.maxWeeklyShifts;
  };

  // First free (empty, unlocked) slot index of a station on a date, or -1.
  const freeSlot = (date: string, stationId: number) => {
    const arr = slotArr(date, stationId);
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i] && !lockedCells?.has(cellKey(date, stationId, i))) return i;
    }
    return -1;
  };

  const place = (date: string, stationId: number, emp: Employee) => {
    const slot = freeSlot(date, stationId);
    if (slot < 0) return false;
    slotArr(date, stationId)[slot] = emp.name;
    employeeAssignments[emp.id][date] = true;
    return true;
  };

  // Pass 1: Specific requests for starred employees.
  employees.filter(emp => emp.hasStar).forEach(employee => {
    employee.specificRequests?.forEach(request => {
      if (
        weekDays.includes(request.date) &&
        !employee.unavailableDays?.includes(request.date) &&
        availableStationsFor(employee).includes(request.stationId) &&
        freeSlot(request.date, request.stationId) >= 0 &&
        !reachedMax(employee)
      ) {
        place(request.date, request.stationId, employee);
      }
    });
  });

  // Pass 2: Fill with starred employees (by minWeeklyShifts desc), one shift/day.
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) => b.minWeeklyShifts - a.minWeeklyShifts)
    .forEach(employee => {
      let assignedCount = getAssignedCount(employee.id);
      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (reachedMax(employee)) break;
        if (employee.unavailableDays?.includes(date)) continue;
        if (employeeAssignments[employee.id][date]) continue;
        for (const stationId of availableStationsFor(employee)) {
          if (place(date, stationId, employee)) { assignedCount++; break; }
        }
      }
    });

  // Pass 3: Specific requests for non-starred employees.
  employees.filter(emp => !emp.hasStar).forEach(employee => {
    employee.specificRequests?.forEach(request => {
      if (
        weekDays.includes(request.date) &&
        !employee.unavailableDays?.includes(request.date) &&
        availableStationsFor(employee).includes(request.stationId) &&
        !employeeAssignments[employee.id][request.date] &&
        freeSlot(request.date, request.stationId) >= 0 &&
        !reachedMax(employee)
      ) {
        place(request.date, request.stationId, employee);
      }
    });
  });

  // Pass 4: Fill with non-starred employees (one per day).
  employees.filter(emp => !emp.hasStar).forEach(employee => {
    for (const date of weekDays) {
      if (employeeAssignments[employee.id][date]) continue;
      if (employee.unavailableDays?.includes(date)) continue;
      if (reachedMax(employee)) break;
      for (const stationId of availableStationsFor(employee)) {
        if (place(date, stationId, employee)) break;
      }
    }
  });

  // Pass 5: Second round for remaining empty slots.
  weekDays.forEach(date => {
    stations.forEach(station => {
      while (freeSlot(date, station.id) >= 0) {
        const candidate = employees.filter(emp => !emp.hasStar).find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          !employeeAssignments[emp.id][date] &&
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp)
        );
        if (!candidate) break;
        place(date, station.id, candidate);
      }
    });
  });

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
      }
    });
  });

  return schedule;
}

export function countFilledSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).reduce((a, cell) => a + cellNames(cell).filter(v => v !== "").length, 0), 0
  );
}

export function countTotalSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).reduce((a, cell) => a + cellNames(cell).length, 0), 0
  );
}

export function calculateWorkloads(schedule: WeeklySchedule): { [name: string]: number } {
  const workload: { [name: string]: number } = {};
  Object.values(schedule).forEach(day => {
    Object.values(day).forEach(cell => {
      cellNames(cell).forEach(name => {
        if (name) workload[name] = (workload[name] || 0) + 1;
      });
    });
  });
  return workload;
}
```

- [ ] **Step 4: Update EmployeeList shift count**

In `src/components/EmployeeList.tsx`:
- Add import: `import { cellNames } from "@/lib/week";`
- Replace `getShiftCount`:

```typescript
function getShiftCount(name: string, schedule?: WeeklySchedule | null): number {
  if (!schedule) return 0;
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).reduce((a, cell) => a + cellNames(cell).filter(v => v === name).length, 0),
    0
  );
}
```

- [ ] **Step 5: Update MonthlyReport reads**

In `src/components/MonthlyReport.tsx`:
- Add import: `import { cellNames } from "@/lib/week";`
- In `buildReport`, replace the inner `Object.entries(daySlots).forEach(([stationId, empName]) => {` block with a version that flattens the cell:

```typescript
      Object.entries(daySlots).forEach(([stationId, cell]) => {
        const stationName = stationMap.get(Number(stationId)) ?? `עמדה ${stationId}`;
        cellNames(cell).forEach(empName => {
          if (!empName) return;
          const entry: ShiftEntry = {
            date: d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }),
            stationName,
          };
          if (!empMap.has(empName)) empMap.set(empName, []);
          empMap.get(empName)!.push(entry);
        });
      });
```

- In `buildStationReport`, replace its inner `Object.entries(daySlots).forEach(...)` block with:

```typescript
      Object.entries(daySlots).forEach(([stationId, cell]) => {
        const id = Number(stationId);
        cellNames(cell).forEach(empName => {
          total.set(id, (total.get(id) ?? 0) + 1);
          if (empName) filled.set(id, (filled.get(id) ?? 0) + 1);
        });
      });
```

Note: the de-dup of `seen.add(s.date + s.stationName)` in `buildReport` would collapse two same-station slots for one employee on one day - but an employee can never occupy two slots of the same station on the same day, so this is harmless.

- [ ] **Step 6: Update ScheduleChanges diff (per slot)**

In `src/components/ScheduleChanges.tsx`:
- Add import: `import { getWeekDays, cellNames, stationSlots } from "@/lib/week";` (merge with the Task 2 import).
- Replace the change-collection loop body with a per-slot comparison:

```typescript
  getWeekDays(currentWeekStart, activeDays).forEach((date) => {
    stations.forEach((station) => {
      const cur = cellNames(currentSchedule[date]?.[station.id]);
      const prev = cellNames(previousSchedule[date]?.[station.id]);
      const slots = Math.max(stationSlots(station), cur.length, prev.length);
      for (let i = 0; i < slots; i++) {
        const currentEmp = cur[i] || "";
        const previousEmp = prev[i] || "";
        if (currentEmp !== previousEmp) {
          changes.push({
            date,
            stationName: station.name,
            previousEmployee: previousEmp || "לא משובץ",
            currentEmployee: currentEmp || "לא משובץ",
          });
        }
      }
    });
  });
```

- [ ] **Step 7: Update ScheduleTable read path + per-slot keys (still 1 row each)**

In `src/components/ScheduleTable.tsx`:
- Update import to: `import { getWeekDays, getHebrewDayLabels, cellNames, stationSlots, cellKey } from "@/lib/week";`
- DELETE the local `cellKey` function (now imported from week.ts).
- Change the prop callback signatures in `ScheduleTableProps`:

```typescript
  onCellEdit: (date: string, stationId: number, slotIndex: number, employeeName: string) => void;
  onSwapCells: (date1: string, stationId1: number, slot1: number, date2: string, stationId2: number, slot2: number) => void;
  onToggleLock: (date: string, stationId: number, slotIndex: number) => void;
```

- Update internal state and handlers to carry `slotIndex`:
  - `editCell` state type: `{ date: string; stationId: number; slotIndex: number } | null`.
  - `dragSource` ref type: `{ date: string; stationId: number; slotIndex: number; name: string } | null`.
  - `handleCellClick(date, stationId, slotIndex)`, `handleDragStart(date, stationId, slotIndex, name)`, `handleDrop(targetDate, targetStationId, targetSlot)`, `handleSelectEmployee` call `onCellEdit(editCell.date, editCell.stationId, editCell.slotIndex, name)`.
- Replace `emptyPerDay` with a cellNames-aware count:

```typescript
  const emptyPerDay = weekDays.map(date =>
    stations.reduce((acc, st) => {
      const names = cellNames(schedule[date]?.[st.id]);
      let empty = 0;
      for (let i = 0; i < stationSlots(st); i++) if (!names[i]) empty++;
      return acc + empty;
    }, 0)
  );
```

- Replace `employeeWeekShifts` with a slot-flattened version:

```typescript
  const employeeWeekShifts = viewEmployee
    ? weekDays.flatMap(date =>
        stations
          .filter(s => cellNames(schedule[date]?.[s.id]).includes(viewEmployee))
          .map(s => ({
            day: hebrewDays[weekDays.indexOf(date)],
            date,
            station: s.name,
          }))
      )
    : [];
```

- In the table body, keep ONE row per station for now but read slot 0. Replace `const name = schedule[date]?.[station.id] ?? "";` with `const name = cellNames(schedule[date]?.[station.id])[0] ?? "";` and update the three handler calls in that cell to pass slot `0`: `handleCellClick(date, station.id, 0)`, `handleDragStart(date, station.id, 0, name)`, `handleDrop(date, station.id, 0)`, `onToggleLock(date, station.id, 0)`, and `cellKey(date, station.id, 0)`.

(Full multi-row rendering comes in Task 6.)

- [ ] **Step 8: Update Index handlers to per-slot**

In `src/pages/Index.tsx`:
- Add to the week import: `cellNames`, `stationSlots`, and import `cellKey` from week.ts. DELETE the local `cellKey` function.
- Replace `addAuditEntry`:

```typescript
  const addAuditEntry = useCallback((date: string, stationId: number, slotIndex: number, from: string, to: string) => {
    const key = cellKey(date, stationId, slotIndex);
    const entry: AuditEntry = { from, to, timestamp: new Date().toISOString() };
    setAuditLog(prev => ({ ...prev, [key]: [...(prev[key] ?? []).slice(-19), entry] }));
  }, []);
```

- Replace `handleCellEdit` with a slot-aware version:

```typescript
  const handleCellEdit = (date: string, stationId: number, slotIndex: number, employeeName: string) => {
    if (employeeName && schedule) {
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
```

- Replace `handleSwapCells`:

```typescript
  const handleSwapCells = (date1: string, stationId1: number, slot1: number, date2: string, stationId2: number, slot2: number) => {
    if (!schedule) return;
    const name1 = cellNames(schedule[date1]?.[stationId1])[slot1] ?? "";
    const name2 = cellNames(schedule[date2]?.[stationId2])[slot2] ?? "";
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
```

- Replace `handleToggleLock`:

```typescript
  const handleToggleLock = (date: string, stationId: number, slotIndex: number) => {
    const key = cellKey(date, stationId, slotIndex);
    setLockedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); toast({ title: "נעילה בוטלה" }); }
      else { next.add(key); toast({ title: "התא ננעל 🔒" }); }
      return next;
    });
  };
```

- In `doGenerate`, replace the locked-base build inner loop to use slot keys:

```typescript
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
```

- Replace `emptySlots` memo:

```typescript
  const emptySlots = useMemo(() => {
    if (!schedule) return 0;
    return Object.values(schedule).reduce(
      (count, day) => count + Object.values(day).reduce((a, cell) => a + cellNames(cell).filter(v => !v).length, 0), 0
    );
  }, [schedule]);
```

- Replace the `workloadData` memo's shift count to use cellNames:

```typescript
      const shifts = days.filter(d =>
        stations.some(st => cellNames(schedule[d]?.[st.id]).includes(emp.name))
      ).length;
```

- In `handleExportToExcel`, replace `schedule[date]?.[station.id] || "לא משובץ"` with `cellNames(schedule[date]?.[station.id]).filter(Boolean).join(", ") || "לא משובץ"`.

- [ ] **Step 9: Verify build, lint, and regression**

Run: `npm run build && npm run lint`
Expected: PASS. Then `npm run dev` and confirm the app behaves exactly as before (every station shows one slot): generate a schedule, edit a cell, drag-swap, lock a cell, view audit history, export Excel - all work. Load an existing saved schedule from the archive - it renders correctly (legacy string cells).

- [ ] **Step 10: Commit**

```bash
git add src/types/employee.ts src/lib/week.ts src/lib/scheduler.ts src/pages/Index.tsx src/components/ScheduleTable.tsx src/components/ScheduleChanges.tsx src/components/MonthlyReport.tsx src/components/EmployeeList.tsx
git commit -m "refactor: migrate schedule cells to arrays (slot model, no behavior change)"
```

---

## Task 4: Add `requiredCount` input to StationManager

**Files:**
- Modify: `src/components/StationManager.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `Station.requiredCount`.
- Produces: `onAdd(name: string, requiredCount: number)`, `onEdit(id: number, name: string, requiredCount: number)`.

- [ ] **Step 1: Update StationManager UI and callbacks**

In `src/components/StationManager.tsx`:
- Change props:

```typescript
interface StationManagerProps {
  stations: Station[];
  onAdd: (name: string, requiredCount: number) => void;
  onEdit: (id: number, name: string, requiredCount: number) => void;
  onDelete: (id: number) => void;
}
```

- Add count state: `const [newStationCount, setNewStationCount] = useState(1);` and `const [editingCount, setEditingCount] = useState(1);`
- In `handleAdd`: call `onAdd(newStationName.trim(), Math.max(1, newStationCount));` then reset `setNewStationCount(1);`
- In `startEdit(station)`: also `setEditingCount(station.requiredCount ?? 1);`
- In `saveEdit`: call `onEdit(editingId, editingName.trim(), Math.max(1, editingCount));`
- Add a number input to the add form (next to the name input), width-constrained:

```tsx
        <Input
          type="number"
          min={1}
          value={newStationCount}
          onChange={(e) => setNewStationCount(Number(e.target.value) || 1)}
          className="w-24"
          title="כמה עובדים נדרשים בו זמנית"
          placeholder="עובדים"
        />
```

- In the edit row (the `editingId === station.id` branch), add the same number input bound to `editingCount`/`setEditingCount` next to the editing name input.
- In the display row (the non-editing branch), show the count next to the name when greater than 1:

```tsx
                      <span className="font-medium">{station.name}</span>
                      {(station.requiredCount ?? 1) > 1 && (
                        <Badge variant="secondary" className="text-xs">{station.requiredCount} עובדים</Badge>
                      )}
```

- [ ] **Step 2: Update Index station handlers**

In `src/pages/Index.tsx`:
- Replace `handleAddStation` and `handleEditStation`:

```typescript
  const handleAddStation = (name: string, requiredCount: number) => {
    const newId = stations.length > 0 ? Math.max(...stations.map(s => s.id)) + 1 : 1;
    setStations(prev => [...prev, { id: newId, name, requiredCount }]);
    toast({ title: "העמדה נוספה" });
  };

  const handleEditStation = (id: number, name: string, requiredCount: number) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, name, requiredCount } : s));
    toast({ title: "העמדה עודכנה" });
  };
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`npm run dev`. In "עמדות", add a station with 3 workers - the list shows a "3 עובדים" badge. Edit an existing station and change its count - it saves. (The schedule still renders one row per station until Task 6; that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/components/StationManager.tsx src/pages/Index.tsx
git commit -m "feat: per-station required employee count input"
```

---

## Task 5: Fill all slots in the scheduler

**Files:**
- (none new - scheduler already fills all slots from Task 3's Pass 5/6)

**Interfaces:** No code change. This task verifies that generation now fills every slot of multi-worker stations, because Task 3's `freeSlot`/`place` loops already iterate all slots.

- [ ] **Step 1: Manual verification**

`npm run dev`. Set a station to require 2 workers. Add at least 2 eligible employees. Press "צור שיבוץ". Confirm the generated data fills 2 distinct employees for that station each day (inspect via export to Excel, which joins names with commas - Task 3 Step 8). Since `ScheduleTable` still renders one row until Task 6, use the Excel export to verify the second name is present.

- [ ] **Step 2: Commit (no-op marker, skip if nothing changed)**

If Task 3 already satisfied this, no commit is needed. Otherwise:

```bash
git commit --allow-empty -m "test: verify scheduler fills all station slots"
```

---

## Task 6: Render one row per slot in ScheduleTable

**Files:**
- Modify: `src/components/ScheduleTable.tsx`

**Interfaces:**
- Consumes: `stationSlots`, `cellNames`, `cellKey` (already imported in Task 3).

- [ ] **Step 1: Expand the station row into one row per slot**

In `src/components/ScheduleTable.tsx`, replace the `{stations.map(station => ( <TableRow ...> ... </TableRow> ))}` block in `<TableBody>` with a version that maps each station to `stationSlots(station)` rows. The station-name cell uses `rowSpan` and renders only on the first slot row; the slot number is shown when the station has more than one slot:

```tsx
              {stations.flatMap(station => {
                const slots = stationSlots(station);
                return Array.from({ length: slots }, (_, slotIndex) => (
                  <TableRow key={`${station.id}-${slotIndex}`} className="border-b border-border hover:bg-muted/30 transition-colors">
                    {weekDays.map(date => {
                      const name = cellNames(schedule[date]?.[station.id])[slotIndex] ?? "";
                      const shifts = workloads[name] ?? 0;
                      const key = cellKey(date, station.id, slotIndex);
                      const locked = lockedCells.has(key);
                      const isDragOver = dragOver === key;

                      const empColor = name ? getEmployeeColor(name, darkMode) : null;
                      const chipStyle = (cellColors && empColor)
                        ? { background: empColor.bg, color: empColor.text, borderRight: `3px solid ${empColor.accent}` }
                        : undefined;

                      return (
                        <TableCell
                          key={date}
                          className={`text-center py-2 px-2 transition-colors ${isDragOver ? "bg-primary/10" : ""}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(key); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleDrop(date, station.id, slotIndex)}
                        >
                          <div className="flex items-center justify-center gap-1 group">
                            {name ? (
                              <div className="flex items-center gap-0.5">
                                <Badge
                                  variant="secondary"
                                  draggable={!locked}
                                  onDragStart={() => handleDragStart(date, station.id, slotIndex, name)}
                                  onDragEnd={() => { dragSource.current = null; setDragOver(null); }}
                                  className={`font-medium text-xs px-2.5 py-1 rounded-md border select-none transition-all
                                    ${locked ? "ring-2 ring-orange-300 dark:ring-orange-700 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:scale-105"}
                                    ${cellColors && empColor ? "" : badgeStyle(shifts)}
                                  `}
                                  style={chipStyle}
                                  title={`לחץ לעריכה${locked ? " (נעול)" : ""}`}
                                  onClick={() => !locked && handleCellClick(date, station.id, slotIndex)}
                                >
                                  {locked && <Lock className="h-2.5 w-2.5 ml-1 inline" />}
                                  {!(cellColors && empColor) && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full ml-1.5" style={{ background: getEmployeeColor(name, darkMode).accent }} />
                                  )}
                                  {name}
                                </Badge>
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                                  title={`פרטי ${name}`}
                                  onClick={() => setViewEmployee(name)}
                                >
                                  <Eye className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="opacity-0 group-hover:opacity-60 transition-all text-xs cursor-pointer text-primary border border-dashed border-primary/40 rounded-full px-2.5 py-0.5 hover:opacity-100 hover:bg-primary/5 hover:border-primary/60"
                                onClick={() => handleCellClick(date, station.id, slotIndex)}
                              >
                                + שבץ
                              </button>
                            )}
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                              title={locked ? "בטל נעילה" : "נעל תא"}
                              onClick={() => onToggleLock(date, station.id, slotIndex)}
                            >
                              {locked
                                ? <Lock className="h-3 w-3 text-orange-400" />
                                : <LockOpen className="h-3 w-3 text-muted-foreground" />
                              }
                            </button>
                            {(auditLog[key]?.length ?? 0) > 0 && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="היסטוריית שינויים"
                                onClick={() => setAuditCell(key)}
                              >
                                <History className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                    {slotIndex === 0 && (
                      <TableCell rowSpan={slots} className="font-medium text-right py-3 border-r border-border align-middle">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-bold">{station.name}</span>
                          {slots > 1 && <Badge variant="secondary" className="text-xs">{slots} עובדים</Badge>}
                          <Badge variant="outline" className="text-xs">{station.id}</Badge>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ));
              })}
```

- [ ] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual verification**

`npm run dev`. Set a station to 3 workers. Press "צור שיבוץ".
1. That station spans 3 rows; the station name cell spans them (rowSpan) and shows a "3 עובדים" badge.
2. Each of the 3 rows is independently editable, draggable, lockable, with its own audit history.
3. The day header "ריקות" count and the "משבצות ריקות" status reflect unfilled slots across all 3 rows.
4. Lock one slot, press "צור שיבוץ", choose "שמר נעולים" - only that slot is preserved.
5. Stations left at 1 worker still render as a single row, unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleTable.tsx
git commit -m "feat: render one row per required slot in the schedule table"
```

---

## Self-Review Notes (resolved)

- **Spec coverage:** Both features covered - work days (Tasks 1-2), per-station staffing (Tasks 3-6). `week.ts` centralization (Task 1, extended Task 3). Backward compat via `cellNames` (Task 3, used in MonthlyReport/ScheduleChanges/EmployeeList). Sync of `activeDays` across all six sync spots (Task 2 Step 5).
- **Type consistency:** `cellNames`/`stationSlots`/`cellKey` signatures defined once in week.ts and consumed identically. `onCellEdit`/`onSwapCells`/`onToggleLock` gain `slotIndex`/`slot` params consistently in ScheduleTable props (Task 3 Step 7) and Index handlers (Task 3 Step 8).
- **Lock migration caveat:** Phase 1 locks keyed `date__stationId` become `date__stationId__slotIndex` in Phase 2. Pre-existing locks from before Phase 2 silently stop matching (locks are transient per-week) - acceptable per YAGNI, no migration.
- **Placeholder scan:** No TBD/TODO; every code step shows full code.
