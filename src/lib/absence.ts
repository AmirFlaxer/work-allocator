import { parseISODate } from "@/lib/week";

/** ההקשר שמחזיר get_share_absence_context לעמוד השיתוף. */
export interface ShareAbsenceContext {
  weekStart: string;         // YYYY-MM-DD מקומי (מ-published_schedules)
  activeDays: number[];
  currentSickDates: string[];
}

/** שורת היעדרות כפי שנטענת בצד המנהל (employee_id, לא שם). */
export interface AbsenceRecord {
  employeeId: string;
  date: string;              // YYYY-MM-DD
  resolvedAt: string | null; // מתי המנהל סימן "טופל" - null = עדיין פתוח
}

/** מפתח אחיד תאריך+שם לסימון תאים בטבלה. */
export function absenceKey(date: string, employeeName: string): string {
  return `${date}|${employeeName}`;
}

/** סט מפתחות תאריך+שם לכל ההיעדרויות (מיפוי employee_id לשם דרך employees). */
export function absentKeySet(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
): Set<string> {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const set = new Set<string>();
  absences.forEach(a => {
    if (a.resolvedAt) return; // הסימון האדום נעלם אחרי "טופל"
    const name = nameById.get(a.employeeId);
    if (name) set.add(absenceKey(a.date, name));
  });
  return set;
}

/** היעדרויות פתוחות (לא-מטופלות) שתאריכן בימי השבוע הנתונים - לבאנר של המנהל. */
export function absencesForWeek(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
  weekDays: string[],
): { employeeId: string; employeeName: string; date: string }[] {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const daySet = new Set(weekDays);
  return absences
    .filter(a => !a.resolvedAt && daySet.has(a.date) && nameById.has(a.employeeId))
    .map(a => ({ employeeId: a.employeeId, employeeName: nameById.get(a.employeeId)!, date: a.date }));
}

/** ספירת ימי-מחלה שדווחו פר שם עובד לחודש/שנה (month 0-indexed). ספירה בלבד. */
export function buildSickCounts(
  absences: AbsenceRecord[],
  employees: { id: string; name: string }[],
  month: number,
  year: number,
): Record<string, number> {
  const nameById = new Map(employees.map(e => [e.id, e.name]));
  const counts: Record<string, number> = {};
  absences.forEach(a => {
    const name = nameById.get(a.employeeId);
    if (!name) return;
    const d = parseISODate(a.date);
    if (d.getMonth() !== month || d.getFullYear() !== year) return;
    counts[name] = (counts[name] ?? 0) + 1;
  });
  return counts;
}
