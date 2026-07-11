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
