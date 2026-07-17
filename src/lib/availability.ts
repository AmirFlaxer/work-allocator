import { Employee } from "@/types/employee";
import { getWeekDays } from "@/lib/week";

/** נתוני ההקשר שמחזירה get_share_availability_context לעמוד השיתוף. */
export interface ShareAvailabilityContext {
  weekStart: string;               // ISO מלא (כפי שנשמר ב-app_store)
  activeDays: number[];
  currentUnavailableDays: string[];
}

export interface AvailabilitySubmission {
  employeeId: string;
  unavailableDates: string[];
}

/**
 * ממזג הגשות זמינות של עובדים לתוך unavailableDays - מחליף לגמרי את פרוסת
 * השבוע הרלוונטי (לא union), כדי שגם ביטול-סימון של העובד יכובד.
 * עובדים שלא הגישו, או שנמחקו, לא מושפעים.
 */
export function mergeAvailabilitySubmissions(
  employees: Employee[],
  submissions: AvailabilitySubmission[],
  weekStart: Date,
  activeDays: number[],
): Employee[] {
  if (submissions.length === 0) return employees;
  const weekDays = new Set(getWeekDays(weekStart, activeDays));
  const byEmployee = new Map(submissions.map(s => [s.employeeId, s]));
  return employees.map(emp => {
    const submission = byEmployee.get(emp.id);
    if (!submission) return emp;
    const outsideWeek = (emp.unavailableDays ?? []).filter(d => !weekDays.has(d));
    return { ...emp, unavailableDays: [...outsideWeek, ...submission.unavailableDates] };
  });
}
