import { Station, Cell, Employee, SavedSchedule } from "@/types/employee";

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

// Format a Date's local calendar day as YYYY-MM-DD. toISOString() formats in
// UTC and can shift a day across timezones - never use it for date-only keys.
export function toISODateLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse a YYYY-MM-DD key as local midnight. new Date("YYYY-MM-DD") parses as
// UTC midnight, so displaying it in a negative-UTC timezone shows the
// previous day - always parse date-only keys with this before display.
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Anchor to the Sunday of weekStart's week, then return one ISO date per active
// weekday. Tolerates a weekStart that is not exactly Sunday.
export function getWeekDays(weekStart: Date, activeDays: number[]): string[] {
  const sunday = new Date(weekStart);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return normalizeActiveDays(activeDays).map(weekday => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + weekday);
    return toISODateLocal(d);
  });
}

// Hebrew labels for the active days, in the same order as getWeekDays.
export function getHebrewDayLabels(activeDays: number[]): string[] {
  return normalizeActiveDays(activeDays).map(weekday => ALL_HEBREW_DAYS[weekday]);
}

// Normalize a cell to an array of names. Accepts legacy string cells.
export function cellNames(cell: Cell | undefined | null): string[] {
  if (cell === undefined || cell === null) return [];
  return Array.isArray(cell) ? cell : [cell];
}

// How many simultaneous employees a station needs (default 1).
export function stationSlots(station: Station): number {
  return Math.max(1, station.requiredCount ?? 1);
}

// How many shifts an employee may work in a single day (default 1).
// Reads maxDailyShifts, falling back to the legacy canWorkMultipleStations flag.
export function dailyShiftCap(employee: Employee): number {
  if (employee.maxDailyShifts != null) return Math.max(1, employee.maxDailyShifts);
  return employee.canWorkMultipleStations ? 2 : 1;
}

// Cell identity key including the slot index.
export function cellKey(date: string, stationId: number, slotIndex: number): string {
  return `${date}__${stationId}__${slotIndex}`;
}

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
