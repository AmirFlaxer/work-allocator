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
