import { describe, it, expect } from "vitest";
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { generateWeeklySchedule, countFilledSlots, calculateWorkloads, calculateRecentLoad } from "@/lib/scheduler";
import { getWeekDays, cellKey, cellNames, toISODateLocal, parseISODate, DEFAULT_ACTIVE_DAYS, latestSchedulePerWeek } from "@/lib/week";

// Sunday, 2026-07-12 (local time).
const WEEK_START = new Date(2026, 6, 12);

const emp = (over: Partial<Employee> & { id: string; name: string }): Employee => ({
  availableStations: [],
  hasStar: false,
  minWeeklyShifts: 0,
  ...over,
});

const st = (id: number, requiredCount = 1): Station => ({ id, name: `עמדה ${id}`, requiredCount });

const namesAt = (schedule: WeeklySchedule, date: string, stationId: number) =>
  cellNames(schedule[date]?.[stationId]);

const weekOf = (year: number, month: number, day: number) => new Date(year, month, day);

const savedWeek = (weekStart: Date, savedAt: string, names: Record<string, number>): SavedSchedule => {
  const [day] = getWeekDays(weekStart, [0]);
  const schedule: WeeklySchedule = { [day]: {} };
  let stationId = 1;
  Object.entries(names).forEach(([name, count]) => {
    for (let i = 0; i < count; i++) {
      schedule[day][stationId] = [name];
      stationId++;
    }
  });
  return { id: savedAt, name: toISODateLocal(weekStart), schedule, weekStart: day, savedAt };
};

describe("generateWeeklySchedule", () => {
  it("ממלא את כל המשבצות כשיש מספיק עובדים", () => {
    const stations = [st(1, 2)];
    const employees = [emp({ id: "a", name: "אבי" }), emp({ id: "b", name: "בני" })];
    const schedule = generateWeeklySchedule(employees, stations, WEEK_START, [0]);
    const [day] = getWeekDays(WEEK_START, [0]);
    expect(namesAt(schedule, day, 1).sort()).toEqual(["אבי", "בני"]);
  });

  it("מכבד ימים לא זמינים", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [emp({ id: "a", name: "אבי", unavailableDays: [days[0]] })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1]);
    expect(namesAt(schedule, days[0], 1)).toEqual([""]);
    expect(namesAt(schedule, days[1], 1)).toEqual(["אבי"]);
  });

  it("לא חורג ממקסימום משמרות שבועי", () => {
    const employees = [emp({ id: "a", name: "אבי", maxWeeklyShifts: 2 })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, DEFAULT_ACTIVE_DAYS);
    expect(countFilledSlots(schedule)).toBe(2);
  });

  it("עובד מוגבל לעמדות הזמינות שלו; רשימה ריקה פירושה כל העמדות", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const restricted = emp({ id: "a", name: "אבי", availableStations: [2] });
    const anyStation = emp({ id: "b", name: "בני" });
    const schedule = generateWeeklySchedule([restricted, anyStation], [st(1), st(2)], WEEK_START, [0]);
    expect(namesAt(schedule, days[0], 2)).toContain("אבי");
    expect(namesAt(schedule, days[0], 1)).not.toContain("אבי");
    expect(namesAt(schedule, days[0], 1)).toContain("בני");
  });

  it("בקשה ספציפית של עובד מסומן בכוכב מקבלת עדיפות", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [emp({
      id: "a", name: "אבי", hasStar: true, minWeeklyShifts: 1, maxWeeklyShifts: 1,
      specificRequests: [{ date: days[1], stationId: 1 }],
    })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1]);
    expect(namesAt(schedule, days[1], 1)).toEqual(["אבי"]);
    expect(namesAt(schedule, days[0], 1)).toEqual([""]);
  });

  it("משמר תאים נעולים מהשיבוץ הקודם ולא דורס אותם", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const base: WeeklySchedule = { [day]: { 1: ["בני"] } };
    const locked = new Set([cellKey(day, 1, 0)]);
    const employees = [emp({ id: "a", name: "אבי" }), emp({ id: "b", name: "בני" })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0], base, locked);
    expect(namesAt(schedule, day, 1)).toEqual(["בני"]);
  });

  it("מחלק משמרות עודפות לעובד העמוס פחות, לא לראשון ברשימה", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    // אבי זמין בשני הימים, בני רק ביום השני - כך שלפני החלוקה העודפת
    // לאבי יש 2 ימים ולבני יום אחד.
    const employees = [
      emp({ id: "a", name: "אבי", maxDailyShifts: 2 }),
      emp({ id: "b", name: "בני", maxDailyShifts: 2, unavailableDays: [days[0]] }),
    ];
    const schedule = generateWeeklySchedule(employees, [st(1, 2), st(2)], WEEK_START, [0, 1]);
    // המשבצת העודפת ביום השני (עמדה 2) צריכה ללכת לבני העמוס פחות.
    expect(namesAt(schedule, days[1], 2)).toEqual(["בני"]);
  });

  it("תקרת משמרות יומית: canWorkMultipleStations הישן מתורגם לתקרה של 2", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const employees = [emp({ id: "a", name: "אבי", canWorkMultipleStations: true })];
    const schedule = generateWeeklySchedule(employees, [st(1), st(2)], WEEK_START, [0]);
    expect(namesAt(schedule, day, 1)).toEqual(["אבי"]);
    expect(namesAt(schedule, day, 2)).toEqual(["אבי"]);
  });

  it("עובד ללא ריבוי משמרות לא משובץ פעמיים באותו יום", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const employees = [emp({ id: "a", name: "אבי" })];
    const schedule = generateWeeklySchedule(employees, [st(1), st(2)], WEEK_START, [0]);
    const total = namesAt(schedule, day, 1).concat(namesAt(schedule, day, 2)).filter(Boolean);
    expect(total).toEqual(["אבי"]);
  });

  it("calculateWorkloads סופר משבצות לכל עובד", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const schedule: WeeklySchedule = {
      [days[0]]: { 1: ["אבי", "בני"] },
      [days[1]]: { 1: ["אבי", ""] },
    };
    expect(calculateWorkloads(schedule)).toEqual({ "אבי": 2, "בני": 1 });
  });
});

describe("calculateRecentLoad", () => {
  it("סופר משמרות רק ב-4 השבועות שלפני השבוע הנוכחי, לא כולל אותו", () => {
    const saved: SavedSchedule[] = [
      savedWeek(weekOf(2026, 5, 7), "2026-06-08T08:00:00.000Z", { "אבי": 1 }),   // 5 שבועות אחורה - מחוץ לחלון
      savedWeek(weekOf(2026, 5, 14), "2026-06-15T08:00:00.000Z", { "אבי": 1 }),  // 4 שבועות אחורה
      savedWeek(weekOf(2026, 5, 21), "2026-06-22T08:00:00.000Z", { "אבי": 1 }),  // 3 שבועות אחורה
      savedWeek(weekOf(2026, 5, 28), "2026-06-29T08:00:00.000Z", { "בני": 1 }),  // 2 שבועות אחורה
      savedWeek(weekOf(2026, 6, 5), "2026-07-06T08:00:00.000Z", { "אבי": 1 }),   // שבוע אחורה
      savedWeek(WEEK_START, "2026-07-13T08:00:00.000Z", { "אבי": 5 }),           // השבוע הנוכחי - לא נספר
    ];
    const load = calculateRecentLoad(saved, WEEK_START);
    expect(load.get("אבי")).toBe(3); // 4/3/1 שבועות אחורה; 5-שבועות-אחורה מחוץ לחלון
    expect(load.get("בני")).toBe(1);
  });

  it("מאחד שמירה כפולה של אותו שבוע - נספרת רק האחרונה", () => {
    const priorWeek = weekOf(2026, 6, 5);
    const [day] = getWeekDays(priorWeek, [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "טיוטה", schedule: { [day]: { 1: ["אבי"] } }, weekStart: day, savedAt: "2026-07-06T08:00:00.000Z" },
      { id: "2", name: "סופי", schedule: { [day]: { 1: ["בני"] } }, weekStart: day, savedAt: "2026-07-07T08:00:00.000Z" },
    ];
    const load = calculateRecentLoad(saved, WEEK_START);
    expect(load.get("אבי")).toBeUndefined();
    expect(load.get("בני")).toBe(1);
  });
});

describe("week helpers", () => {
  it("toISODateLocal ו-parseISODate הם הפוכים זה של זה", () => {
    const iso = "2026-07-12";
    expect(toISODateLocal(parseISODate(iso))).toBe(iso);
  });

  it("getWeekDays מעוגן ליום ראשון גם כשה-weekStart אינו יום ראשון", () => {
    const wednesday = new Date(2026, 6, 15);
    expect(getWeekDays(wednesday, [0, 4])).toEqual(["2026-07-12", "2026-07-16"]);
  });

  it("latestSchedulePerWeek משאיר רק את השמירה האחרונה של כל שבוע", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "טיוטה", schedule: {}, weekStart: day, savedAt: "2026-07-10T08:00:00.000Z" },
      { id: "2", name: "סופי", schedule: {}, weekStart: day, savedAt: "2026-07-12T08:00:00.000Z" },
    ];
    const result = latestSchedulePerWeek(saved);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("latestSchedulePerWeek משאיר שבועות שונים בנפרד", () => {
    const [day1] = getWeekDays(WEEK_START, [0]);
    const [day2] = getWeekDays(new Date(2026, 6, 19), [0]);
    const saved: SavedSchedule[] = [
      { id: "1", name: "א", schedule: {}, weekStart: day1, savedAt: "2026-07-10T08:00:00.000Z" },
      { id: "2", name: "ב", schedule: {}, weekStart: day2, savedAt: "2026-07-17T08:00:00.000Z" },
    ];
    expect(latestSchedulePerWeek(saved)).toHaveLength(2);
  });
});
