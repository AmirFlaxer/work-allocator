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
