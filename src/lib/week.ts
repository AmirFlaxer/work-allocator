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
