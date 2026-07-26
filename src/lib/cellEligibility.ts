import { Employee, WeeklySchedule } from "@/types/employee";
import { cellNames, dailyShiftCap } from "@/lib/week";

// למה זו אזהרה ולא חסימה: בחירת-עובד לתא היא כלי-עקיפה של המנהל - הוא יודע
// דברים שהמערכת לא (החלפה חד-פעמית, סידור מחוץ למערכת). מה שהיה חסר זה סימון:
// עד כה אפשר היה לשבץ עובד לעמדה שאינה מורשית לו, או ביום שסימן "לא זמין",
// בלי שום חיווי - והתא נצבע כתקין.
export type CellWarning = "station" | "unavailable" | "sameDay" | "preferNot";

// מהחמור לקל. "station" ו-"unavailable" הן הפרות של אילוץ מוצהר;
// "sameDay" ו-"preferNot" הן העדפות שהמנהל עשוי לדרוס במודע.
const SEVERITY: CellWarning[] = ["station", "unavailable", "sameDay", "preferNot"];

const LABELS: Record<CellWarning, string> = {
  station: "לא מורשה בעמדה",
  unavailable: "לא זמין ביום זה",
  sameDay: "כבר משובץ היום",
  preferNot: "מעדיף שלא ביום זה",
};

export function cellWarningLabel(warning: CellWarning): string {
  return LABELS[warning];
}

// כמה משמרות כבר יש לעובד באותו יום, בלי לספור את המשבצת הנערכת עצמה - היא
// עומדת להיכתב מחדש ונוכחות בה אינה התנגשות. להחריג את **כל** עמדת-היעד
// היה מסתיר בדיוק את המקרה של אותו עובד פעמיים באותה עמדה ובאותו יום
// (עמדה עם requiredCount>1), וזה בדיוק מה שה-scheduler עצמו אוסר.
function shiftsElsewhereToday(
  employee: Employee,
  date: string,
  targetStationId: number,
  targetSlotIndex: number,
  schedule: WeeklySchedule,
): number {
  const day = schedule[date];
  if (!day) return 0;
  return Object.entries(day).reduce((count, [stationId, cell]) => {
    const isTargetStation = Number(stationId) === targetStationId;
    const names = cellNames(cell);
    return count + names.filter((n, i) =>
      n === employee.name && !(isTargetStation && i === targetSlotIndex)
    ).length;
  }, 0);
}

export function cellAssignmentWarnings(
  employee: Employee,
  date: string,
  stationId: number,
  slotIndex: number,
  schedule: WeeklySchedule,
): CellWarning[] {
  const found = new Set<CellWarning>();

  // רשימת-עמדות ריקה = כל העמדות (אותה סמנטיקה כמו ב-scheduler).
  const stations = employee.availableStations ?? [];
  if (stations.length > 0 && !stations.includes(stationId)) found.add("station");

  if (employee.unavailableDays?.includes(date)) found.add("unavailable");
  if (employee.preferNotDays?.includes(date)) found.add("preferNot");

  if (shiftsElsewhereToday(employee, date, stationId, slotIndex, schedule) >= dailyShiftCap(employee)) {
    found.add("sameDay");
  }

  return SEVERITY.filter(w => found.has(w));
}
