import { describe, it, expect } from "vitest";
import { generateWeeklySchedule, countFilledSlots, countTotalSlots, calculateWorkloads } from "@/lib/scheduler";
import { Employee, Station } from "@/types/employee";

// התרחיש המלא מהבדיקה מקצה-לקצה של 26/7/2026, שממנו נולדו שלושת שלבי
// ה-scheduler האחרונים. הוא נשמר כבדיקה אחת כי כל שלב לבדו נראה מספיק
// עד שמדדו את התוצאה השלמה:
//   לפני שלב 9:   2 משבצות ריקות · מאיה בר 0/1, מתחת למינימום
//   אחרי שלב 9+10: 1 משבצת ריקה · המינימומים סופקו
//   אחרי שלב 11:   0 ריקות · המינימומים סופקו
// שילוב מכוון של שלושה לחצים: עובדת שזמינה בעמדה אחת בלבד, עובד שחסום
// יומיים, ועמדה שדורשת שני אנשים - בדיוק ההרכב שגרם לגרסה הראשונה להרעיב
// את מאיה לחלוטין.
describe("תרחיש-שדה: 5 עובדים, 3 עמדות, שבוע עם חסימות", () => {
  const stations: Station[] = [
    { id: 1, name: "קופה", requiredCount: 1 },
    { id: 2, name: "מחסן", requiredCount: 1 },
    { id: 3, name: "משמרת ערב", requiredCount: 2 },
  ];

  const employees: Employee[] = [
    { id: "e1", name: "דנה כהן",   hasStar: true,  minWeeklyShifts: 2, maxWeeklyShifts: 5, availableStations: [],  maxDailyShifts: 1 },
    { id: "e2", name: "יוסי לוי",  hasStar: false, minWeeklyShifts: 2, maxWeeklyShifts: 5, availableStations: [],  maxDailyShifts: 1,
      unavailableDays: ["2026-07-26", "2026-07-27"] },
    { id: "e3", name: "מאיה בר",   hasStar: false, minWeeklyShifts: 1, maxWeeklyShifts: 3, availableStations: [1], maxDailyShifts: 1 },
    { id: "e4", name: "אורי נחום", hasStar: false, minWeeklyShifts: 2, maxWeeklyShifts: 5, availableStations: [],  maxDailyShifts: 1 },
    { id: "e5", name: "שיר אלון",  hasStar: false, minWeeklyShifts: 2, maxWeeklyShifts: 5, availableStations: [],  maxDailyShifts: 1 },
  ];

  const schedule = generateWeeklySchedule(employees, stations, new Date(2026, 6, 26), [0, 1, 2, 3, 4]);
  const workloads = calculateWorkloads(schedule);

  it("כל 20 המשבצות מאוישות", () => {
    expect(countTotalSlots(schedule)).toBe(20);
    expect(countFilledSlots(schedule)).toBe(20);
  });

  it("כל עובד מקבל לפחות את המינימום שלו", () => {
    const below = employees
      .filter(e => (workloads[e.name] ?? 0) < e.minWeeklyShifts)
      .map(e => `${e.name} (${workloads[e.name] ?? 0}/${e.minWeeklyShifts})`);
    expect(below, `מתחת למינימום: ${below.join(", ")}`).toEqual([]);
  });

  it("העובדת מוגבלת-העמדות משובצת רק בעמדה שלה", () => {
    Object.entries(schedule).forEach(([date, day]) => {
      Object.entries(day).forEach(([stationId, cell]) => {
        const names = Array.isArray(cell) ? cell : [cell];
        if (names.includes("מאיה בר")) expect(Number(stationId), date).toBe(1);
      });
    });
  });

  it("העובד החסום אינו משובץ בימים שחסם", () => {
    ["2026-07-26", "2026-07-27"].forEach(date => {
      const names = Object.values(schedule[date] ?? {}).flatMap(c => (Array.isArray(c) ? c : [c]));
      expect(names, date).not.toContain("יוסי לוי");
    });
  });

  it("איש אינו חורג מהמקסימום השבועי שלו", () => {
    employees.forEach(e => {
      if (e.maxWeeklyShifts != null) {
        expect(workloads[e.name] ?? 0, e.name).toBeLessThanOrEqual(e.maxWeeklyShifts);
      }
    });
  });

  it("אין עובד פעמיים באותו יום (תקרה יומית 1)", () => {
    Object.entries(schedule).forEach(([date, day]) => {
      const names = Object.values(day).flatMap(c => (Array.isArray(c) ? c : [c])).filter(Boolean);
      expect(new Set(names).size, date).toBe(names.length);
    });
  });
});
