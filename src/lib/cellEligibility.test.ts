import { describe, it, expect } from "vitest";
import { Employee, WeeklySchedule } from "@/types/employee";
import { cellAssignmentWarnings, cellWarningLabel } from "@/lib/cellEligibility";

const emp = (over: Partial<Employee> & { id: string; name: string }): Employee => ({
  availableStations: [],
  hasStar: false,
  minWeeklyShifts: 0,
  ...over,
});

const DATE = "2026-07-26";
const OTHER = "2026-07-27";

describe("cellAssignmentWarnings", () => {
  it("עובד כשיר ופנוי - בלי אזהרות", () => {
    const e = emp({ id: "a", name: "אבי" });
    expect(cellAssignmentWarnings(e, DATE, 1, 0, {})).toEqual([]);
  });

  it("רשימת-עמדות ריקה פירושה כל העמדות - לא אזהרת-עמדה", () => {
    const e = emp({ id: "a", name: "אבי", availableStations: [] });
    expect(cellAssignmentWarnings(e, DATE, 99, 0, {})).toEqual([]);
  });

  it("עמדה שאינה ברשימת העמדות שלו", () => {
    const e = emp({ id: "a", name: "אבי", availableStations: [2] });
    expect(cellAssignmentWarnings(e, DATE, 1, 0, {})).toContain("station");
  });

  it("יום שסומן לא-זמין", () => {
    const e = emp({ id: "a", name: "אבי", unavailableDays: [DATE] });
    expect(cellAssignmentWarnings(e, DATE, 1, 0, {})).toContain("unavailable");
  });

  it("יום שסומן מעדיף-שלא", () => {
    const e = emp({ id: "a", name: "אבי", preferNotDays: [DATE] });
    expect(cellAssignmentWarnings(e, DATE, 1, 0, {})).toContain("preferNot");
  });

  it("כבר משובץ באותו יום כשהתקרה היומית היא 1", () => {
    const e = emp({ id: "a", name: "אבי", maxDailyShifts: 1 });
    const schedule: WeeklySchedule = { [DATE]: { 1: ["אבי"] } };
    expect(cellAssignmentWarnings(e, DATE, 2, 0, schedule)).toContain("sameDay");
  });

  it("תקרה יומית 2 - שיבוץ שני באותו יום אינו אזהרה", () => {
    const e = emp({ id: "a", name: "אבי", maxDailyShifts: 2 });
    const schedule: WeeklySchedule = { [DATE]: { 1: ["אבי"] } };
    expect(cellAssignmentWarnings(e, DATE, 2, 0, schedule)).not.toContain("sameDay");
  });

  it("שיבוץ ביום אחר אינו אזהרה", () => {
    const e = emp({ id: "a", name: "אבי", maxDailyShifts: 1 });
    const schedule: WeeklySchedule = { [OTHER]: { 1: ["אבי"] } };
    expect(cellAssignmentWarnings(e, DATE, 1, 0, schedule)).not.toContain("sameDay");
  });

  it("נוכחות במשבצת הנערכת עצמה אינה נספרת - היא עומדת להיכתב מחדש", () => {
    const e = emp({ id: "a", name: "אבי", maxDailyShifts: 1 });
    const schedule: WeeklySchedule = { [DATE]: { 1: ["אבי"] } };
    expect(cellAssignmentWarnings(e, DATE, 1, 0, schedule)).not.toContain("sameDay");
  });

  // עמדה עם requiredCount>1: להחריג את כל העמדה במקום את המשבצת הנערכת בלבד
  // מסתיר בדיוק את המקרה של שיבוץ כפול של אותו עובד באותה עמדה ובאותו יום.
  it("משבצת אחרת של אותה עמדה כן נספרת - שיבוץ כפול באותה משמרת", () => {
    const e = emp({ id: "a", name: "אבי", maxDailyShifts: 1 });
    const schedule: WeeklySchedule = { [DATE]: { 1: ["אבי", ""] } };
    expect(cellAssignmentWarnings(e, DATE, 1, 1, schedule)).toContain("sameDay");
  });

  it("מחזיר את החמורה ביותר ראשונה", () => {
    const e = emp({
      id: "a", name: "אבי",
      availableStations: [2], unavailableDays: [DATE], preferNotDays: [DATE],
    });
    expect(cellAssignmentWarnings(e, DATE, 1, 0, {})[0]).toBe("station");
  });

  it("לכל אזהרה יש תווית בעברית", () => {
    (["station", "unavailable", "preferNot", "sameDay"] as const).forEach(w => {
      expect(cellWarningLabel(w).length).toBeGreaterThan(0);
    });
  });
});
