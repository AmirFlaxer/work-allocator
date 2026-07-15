import { describe, it, expect } from "vitest";
import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays } from "@/lib/week";
import {
  buildPublishedPayload, hasUnpublishedChanges, viewerName, viewerShifts,
} from "@/lib/share";

const WEEK_START = new Date(2026, 6, 12); // יום ראשון

const emp = (id: string, name: string): Employee => ({
  id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0,
});
const st = (id: number, name: string, requiredCount = 1): Station => ({ id, name, requiredCount });

const days = getWeekDays(WEEK_START, [0, 1]);
const schedule: WeeklySchedule = {
  [days[0]]: { 1: ["אבי", ""], 2: ["בני"] },
  [days[1]]: { 1: ["בני", "אבי"], 2: [""] },
};
const employees = [emp("e1", "אבי"), emp("e2", "בני")];
const stations = [st(1, "קבלה", 2), st(2, "מוקד")];

describe("buildPublishedPayload", () => {
  it("אורז את כל הנתונים הדרושים לצופה", () => {
    const p = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);
    expect(p.weekStart).toBe("2026-07-12");
    expect(p.activeDays).toEqual([0, 1]);
    expect(p.stations).toEqual([
      { id: 1, name: "קבלה", requiredCount: 2 },
      { id: 2, name: "מוקד", requiredCount: 1 },
    ]);
    expect(p.schedule).toEqual(schedule);
    expect(p.employees).toEqual([{ id: "e1", name: "אבי" }, { id: "e2", name: "בני" }]);
  });
});

describe("hasUnpublishedChanges", () => {
  const published = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);
  const check = (
    p: typeof published | null,
    emps = employees, stns = stations, sched = schedule, ws = WEEK_START, ad = [0, 1],
  ) => hasUnpublishedChanges(p, emps, stns, sched, ws, ad);

  it("אין שיבוץ - אין מה לפרסם", () => {
    expect(hasUnpublishedChanges(published, employees, stations, null, WEEK_START, [0, 1])).toBe(false);
  });

  it("אין פרסום קודם אבל יש שיבוץ - יש שינויים", () => {
    expect(check(null)).toBe(true);
  });

  it("שיבוץ זהה לפרסום - אין שינויים", () => {
    expect(check(published)).toBe(false);
  });

  it("תא השתנה - יש שינויים", () => {
    const changed = { ...schedule, [days[0]]: { ...schedule[days[0]], 2: ["אבי"] } };
    expect(check(published, employees, stations, changed)).toBe(true);
  });

  it("ניווט לשבוע אחר - יש שינויים", () => {
    const nextWeek = new Date(2026, 6, 19);
    expect(check(published, employees, stations, schedule, nextWeek)).toBe(true);
  });

  it("שינוי שם עמדה - יש שינויים (שינוי מבני)", () => {
    const renamedStations = [{ ...stations[0], name: "קבלה חדשה" }, stations[1]];
    expect(check(published, employees, renamedStations)).toBe(true);
  });

  it("שינוי ימים פעילים - יש שינויים", () => {
    expect(check(published, employees, stations, schedule, WEEK_START, [0, 1, 2])).toBe(true);
  });

  it("שינוי שם עובד - יש שינויים", () => {
    const renamedEmployees = [{ ...employees[0], name: "אבי כהן" }, employees[1]];
    expect(check(published, renamedEmployees)).toBe(true);
  });

  it("payload מלא זהה (עמדות, עובדים, ימים) - אין שינויים", () => {
    const sameStations = stations.map(s => ({ ...s }));
    const sameEmployees = employees.map(e => ({ ...e }));
    expect(check(published, sameEmployees, sameStations, schedule, WEEK_START, [0, 1])).toBe(false);
  });

  it("payload זהה בסדר מפתחות שונה (round-trip של JSONB) - אין שינויים", () => {
    // Postgres JSONB מחזיר מפתחות בסדר קנוני, לא בסדר הבנייה - ההשוואה חייבת להיות חסינה לכך.
    const reordered = {
      employees: published.employees,
      schedule: published.schedule,
      stations: published.stations,
      activeDays: published.activeDays,
      weekStart: published.weekStart,
    };
    expect(check(reordered)).toBe(false);
  });
});

describe("viewer helpers", () => {
  const payload = buildPublishedPayload(employees, stations, schedule, WEEK_START, [0, 1]);

  it("viewerName מתרגם מזהה לשם, ומחזיר null למזהה זר", () => {
    expect(viewerName(payload, "e1")).toBe("אבי");
    expect(viewerName(payload, "zzz")).toBeNull();
  });

  it("viewerShifts מחזיר את משמרות הצופה לפי סדר הימים", () => {
    expect(viewerShifts(payload, "e1")).toEqual([
      { day: "ראשון", date: days[0], stationName: "קבלה" },
      { day: "שני",   date: days[1], stationName: "קבלה" },
    ]);
    expect(viewerShifts(payload, "e2")).toEqual([
      { day: "ראשון", date: days[0], stationName: "מוקד" },
      { day: "שני",   date: days[1], stationName: "קבלה" },
    ]);
  });

  it("מזהה שלא ברשימה - רשימת משמרות ריקה", () => {
    expect(viewerShifts(payload, "zzz")).toEqual([]);
  });

  it("weekStart בשעת ערב - עדיין אותו יום מקומי, אותם משמרות", () => {
    const eveningStart = new Date(2026, 6, 12, 23, 30);
    const eveningPayload = buildPublishedPayload(employees, stations, schedule, eveningStart, [0, 1]);
    expect(eveningPayload.weekStart).toBe("2026-07-12");
    expect(viewerShifts(eveningPayload, "e1")).toEqual(viewerShifts(payload, "e1"));
  });
});
