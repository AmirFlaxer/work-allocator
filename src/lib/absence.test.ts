import { describe, it, expect } from "vitest";
import { absenceKey, absentKeySet, absencesForWeek, buildSickCounts, AbsenceRecord } from "./absence";

const employees = [{ id: "a", name: "אבי" }, { id: "b", name: "בני" }];

describe("absenceKey", () => {
  it("בונה מפתח מתאריך ושם", () => {
    expect(absenceKey("2026-07-23", "אבי")).toBe("2026-07-23|אבי");
  });
});

describe("absentKeySet", () => {
  it("ממפה employee_id לשם ובונה מפתחות תאריך+שם", () => {
    const absences: AbsenceRecord[] = [{ employeeId: "a", date: "2026-07-23" }];
    const set = absentKeySet(absences, employees);
    expect(set.has("2026-07-23|אבי")).toBe(true);
    expect(set.has("2026-07-23|בני")).toBe(false);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    const set = absentKeySet([{ employeeId: "x", date: "2026-07-23" }], employees);
    expect(set.size).toBe(0);
  });
});

describe("absencesForWeek", () => {
  it("מחזיר רק היעדרויות שתאריכן בימי השבוע, עם שם העובד", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-23" },
      { employeeId: "b", date: "2026-08-01" },
    ];
    const result = absencesForWeek(absences, employees, ["2026-07-22", "2026-07-23"]);
    expect(result).toEqual([{ employeeName: "אבי", date: "2026-07-23" }]);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    const result = absencesForWeek([{ employeeId: "x", date: "2026-07-23" }], employees, ["2026-07-23"]);
    expect(result).toEqual([]);
  });
});

describe("buildSickCounts", () => {
  it("סופר ימי-מחלה פר שם עובד לחודש/שנה נתונים (0-indexed month)", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-05" },
      { employeeId: "a", date: "2026-07-19" },
      { employeeId: "a", date: "2026-08-02" }, // חודש אחר
      { employeeId: "b", date: "2026-07-10" },
    ];
    const counts = buildSickCounts(absences, employees, 6, 2026); // יולי
    expect(counts["אבי"]).toBe(2);
    expect(counts["בני"]).toBe(1);
  });
  it("עובד בלי דיווחים לא מופיע", () => {
    expect(buildSickCounts([], employees, 6, 2026)).toEqual({});
  });
  it("מסנן לפי שנה, לא רק לפי חודש", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-05" },
      { employeeId: "a", date: "2025-07-05" }, // אותו חודש, שנה קודמת
    ];
    expect(buildSickCounts(absences, employees, 6, 2026)["אבי"]).toBe(1);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    expect(buildSickCounts([{ employeeId: "x", date: "2026-07-05" }], employees, 6, 2026)).toEqual({});
  });
});
