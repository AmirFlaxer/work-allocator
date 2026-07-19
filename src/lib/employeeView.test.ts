import { describe, it, expect } from "vitest";
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { buildEmployeeViewRows } from "./employeeView";

const emp = (id: string, name: string): Employee =>
  ({ id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0 });
const st = (id: number, name: string): Station => ({ id, name });

const DAYS = ["2026-07-19", "2026-07-20"];

describe("buildEmployeeViewRows", () => {
  it("בונה שורה לכל עובד לפי סדר הרשימה, כולל עובד בלי משמרות", () => {
    const employees = [emp("a", "אבי"), emp("b", "בני")];
    const stations = [st(1, "דלפק")];
    const schedule: WeeklySchedule = {
      [DAYS[0]]: { 1: ["אבי"] },
      [DAYS[1]]: { 1: ["אבי"] },
    };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows.map(r => r.name)).toEqual(["אבי", "בני"]);
    expect(rows[0].stationsPerDay).toEqual([["דלפק"], ["דלפק"]]);
    expect(rows[0].total).toBe(2);
    expect(rows[1].stationsPerDay).toEqual([[], []]);
    expect(rows[1].total).toBe(0);
  });

  it("עובד בשתי עמדות באותו יום - שתי העמדות בתא, total סופר ימים ולא משמרות", () => {
    const employees = [emp("a", "אבי")];
    const stations = [st(1, "דלפק"), st(2, "מחסן")];
    const schedule: WeeklySchedule = {
      [DAYS[0]]: { 1: ["אבי"], 2: ["אבי"] },
      [DAYS[1]]: {},
    };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows[0].stationsPerDay[0]).toEqual(["דלפק", "מחסן"]);
    expect(rows[0].total).toBe(1);
  });

  it("תא רב-משבצות (requiredCount>1) - העובד מזוהה גם כשהוא לא ראשון בתא", () => {
    const employees = [emp("b", "בני")];
    const stations = [st(1, "דלפק")];
    const schedule: WeeklySchedule = { [DAYS[0]]: { 1: ["אבי", "בני"] }, [DAYS[1]]: {} };
    const rows = buildEmployeeViewRows(employees, stations, schedule, DAYS);
    expect(rows[0].stationsPerDay[0]).toEqual(["דלפק"]);
  });

  it("יום שחסר ב-schedule נספר כריק", () => {
    const employees = [emp("a", "אבי")];
    const rows = buildEmployeeViewRows(employees, [st(1, "דלפק")], {}, DAYS);
    expect(rows[0].stationsPerDay).toEqual([[], []]);
  });
});
