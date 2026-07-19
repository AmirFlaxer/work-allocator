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
    const absences: AbsenceRecord[] = [{ employeeId: "a", date: "2026-07-23", resolvedAt: null }];
    const set = absentKeySet(absences, employees);
    expect(set.has("2026-07-23|אבי")).toBe(true);
    expect(set.has("2026-07-23|בני")).toBe(false);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    const set = absentKeySet([{ employeeId: "x", date: "2026-07-23", resolvedAt: null }], employees);
    expect(set.size).toBe(0);
  });
  it("מדלג על שורה עם resolvedAt לא-null", () => {
    const absences: AbsenceRecord[] = [{ employeeId: "a", date: "2026-07-23", resolvedAt: "2026-07-24T00:00:00Z" }];
    const set = absentKeySet(absences, employees);
    expect(set.size).toBe(0);
  });
});

describe("absencesForWeek", () => {
  it("מחזיר רק היעדרויות שתאריכן בימי השבוע, עם שם העובד ו-employeeId", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-23", resolvedAt: null },
      { employeeId: "b", date: "2026-08-01", resolvedAt: null },
    ];
    const result = absencesForWeek(absences, employees, ["2026-07-22", "2026-07-23"]);
    expect(result).toEqual([{ employeeId: "a", employeeName: "אבי", date: "2026-07-23" }]);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    const result = absencesForWeek([{ employeeId: "x", date: "2026-07-23", resolvedAt: null }], employees, ["2026-07-23"]);
    expect(result).toEqual([]);
  });
  it("מדלג על שורה מטופלת", () => {
    const absences: AbsenceRecord[] = [{ employeeId: "a", date: "2026-07-23", resolvedAt: "2026-07-24T00:00:00Z" }];
    const result = absencesForWeek(absences, employees, ["2026-07-23"]);
    expect(result).toEqual([]);
  });
});

describe("buildSickCounts", () => {
  it("סופר ימי-מחלה פר שם עובד לחודש/שנה נתונים (0-indexed month)", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-05", resolvedAt: null },
      { employeeId: "a", date: "2026-07-19", resolvedAt: null },
      { employeeId: "a", date: "2026-08-02", resolvedAt: null }, // חודש אחר
      { employeeId: "b", date: "2026-07-10", resolvedAt: null },
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
      { employeeId: "a", date: "2026-07-05", resolvedAt: null },
      { employeeId: "a", date: "2025-07-05", resolvedAt: null }, // אותו חודש, שנה קודמת
    ];
    expect(buildSickCounts(absences, employees, 6, 2026)["אבי"]).toBe(1);
  });
  it("מתעלם מ-employee_id שאין לו עובד תואם", () => {
    expect(buildSickCounts([{ employeeId: "x", date: "2026-07-05", resolvedAt: null }], employees, 6, 2026)).toEqual({});
  });
  it("סופר גם שורות מטופלות (resolvedAt לא-null)", () => {
    const absences: AbsenceRecord[] = [
      { employeeId: "a", date: "2026-07-05", resolvedAt: "2026-07-06T00:00:00Z" },
      { employeeId: "a", date: "2026-07-19", resolvedAt: null },
    ];
    expect(buildSickCounts(absences, employees, 6, 2026)["אבי"]).toBe(2);
  });
});
