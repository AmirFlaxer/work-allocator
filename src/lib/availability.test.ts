import { describe, it, expect } from "vitest";
import { Employee } from "@/types/employee";
import { getWeekDays } from "@/lib/week";
import { mergeAvailabilitySubmissions } from "@/lib/availability";

const WEEK_START = new Date(2026, 6, 12); // יום ראשון
const emp = (id: string, name: string, unavailableDays: string[] = []): Employee => ({
  id, name, availableStations: [], hasStar: false, minWeeklyShifts: 0, unavailableDays,
});
const days = getWeekDays(WEEK_START, [0, 1, 2]);

describe("mergeAvailabilitySubmissions", () => {
  it("אין הגשות - מחזיר את אותו מערך עובדים (זהות אובייקט)", () => {
    const employees = [emp("e1", "אבי")];
    expect(mergeAvailabilitySubmissions(employees, [], WEEK_START, [0, 1, 2])).toBe(employees);
  });

  it("מוסיף ימים לא-זמינים חדשים לעובד שהגיש", () => {
    const employees = [emp("e1", "אבי")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[0], days[2]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([days[0], days[2]]);
  });

  it("מחליף לגמרי את פרוסת השבוע - ביטול סימון קודם מכובד", () => {
    const employees = [emp("e1", "אבי", [days[0], days[1]])];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[1]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([days[1]]);
  });

  it("לא נוגע בתאריכים מחוץ לשבוע הרלוונטי", () => {
    const outsideDate = "2026-01-01";
    const employees = [emp("e1", "אבי", [outsideDate, days[0]])];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [days[1]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([outsideDate, days[1]]);
  });

  it("עובד שלא הגיש - לא מושפע כלל", () => {
    const employees = [emp("e1", "אבי", [days[0]]), emp("e2", "בני")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "e1", unavailableDates: [] }], WEEK_START, [0, 1, 2],
    );
    expect(merged[0].unavailableDays).toEqual([]);
    expect(merged[1]).toBe(employees[1]);
  });

  it("הגשה לעובד שנמחק בינתיים - מתעלם, לא קורס", () => {
    const employees = [emp("e1", "אבי")];
    const merged = mergeAvailabilitySubmissions(
      employees, [{ employeeId: "ghost", unavailableDates: [days[0]] }], WEEK_START, [0, 1, 2],
    );
    expect(merged).toEqual(employees);
  });
});
