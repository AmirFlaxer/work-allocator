import { describe, it, expect } from "vitest";
import { getHolidayForDate, holidayCoverage } from "@/lib/holidays";

describe("getHolidayForDate", () => {
  it("ראש-השנה הוא 'strong'", () => {
    expect(getHolidayForDate("2026-09-12")?.category).toBe("strong");
  });

  it("יום-כיפור הוא 'strong'", () => {
    expect(getHolidayForDate("2026-09-21")?.category).toBe("strong");
  });

  // התאריך של יום-העצמאות זז כל שנה (5 באייר, שנדחה כשחל בסמוך לשבת), ולכן
  // הוא הבדיקה הרגישה ביותר לנכונות המקור. שלוש שנים עוקבות, שלושה תאריכים
  // שונים - זו הבדיקה שהייתה תופסת סחף בין גרסאות של מקור-הנתונים.
  it("יום-העצמאות הוא 'strong' בשלוש שנים עם תאריכים שונים", () => {
    const dates = ["2026-04-22", "2027-05-12", "2028-05-02"];
    expect(new Set(dates).size).toBe(3);
    dates.forEach(d => expect(getHolidayForDate(d)?.category, d).toBe("strong"));
  });

  it("ערב-חג הוא 'light' ונושא שם עם 'ערב'", () => {
    const erev = getHolidayForDate("2026-09-11");
    expect(erev?.category).toBe("light");
    expect(erev?.name).toContain("ערב");
  });

  it("יום-הזיכרון הוא 'light' ולא 'strong' - הוא יום עבודה", () => {
    expect(getHolidayForDate("2026-04-21")?.category).toBe("light");
  });

  it("תשעה-באב הוא 'light'", () => {
    expect(getHolidayForDate("2026-07-23")?.category).toBe("light");
  });

  it("יום-חול רגיל מוחזר null", () => {
    // 15 בכסלו תשפ״ז - אמצע הפער בין יום בן-גוריון לחנוכה.
    expect(getHolidayForDate("2026-11-25")).toBeNull();
  });

  it("תאריך מחוץ לטווח הנתונים מוחזר null ולא זורק", () => {
    expect(getHolidayForDate("1999-01-01")).toBeNull();
    expect(getHolidayForDate("2099-01-01")).toBeNull();
  });

  it("קלט פגום לא מפיל", () => {
    expect(getHolidayForDate("")).toBeNull();
    expect(getHolidayForDate("not-a-date")).toBeNull();
  });
});

// טבלת החגים סטטית ומכוסה עד שנה מוגדרת. בלי הבדיקה הזו היא פשוט תיגמר
// בשקט, והאפליקציה תפסיק לסמן חגים בלי שאיש ישים לב.
// כשהיא נכשלת: להריץ מחדש את scripts/generate-holidays.mjs עם LAST_YEAR גדול יותר.
describe("כיסוי טבלת החגים", () => {
  it("מכסה לפחות 5 שנים קדימה מהיום", () => {
    const yearsAhead = holidayCoverage.lastYear - new Date().getFullYear();
    expect(yearsAhead, `נותרו ${yearsAhead} שנות כיסוי - להריץ מחדש את scripts/generate-holidays.mjs`)
      .toBeGreaterThanOrEqual(5);
  });

  it("מתחיל לא אחרי 2025, כדי שדוחות על שנים קודמות לא יאבדו חגים", () => {
    expect(holidayCoverage.firstYear).toBeLessThanOrEqual(2025);
  });
});
