import { describe, it, expect } from "vitest";
import { categorizeHolidayEvent, getHolidayForDate } from "@/lib/holidays";
import { toISODateLocal } from "@/lib/week";

const mockEvent = (flagsValue: number, name = "Event") => ({
  getFlags: () => flagsValue,
  basename: () => name,
});

describe("categorizeHolidayEvent", () => {
  it("CHAG הופך לקטגוריה 'strong'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x1, "Rosh Hashana"))).toBe("strong");
  });

  it("יום העצמאות הוא מקרה-פרטי - MODERN_HOLIDAY אבל 'strong'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x2000, "Yom HaAtzma'ut"))).toBe("strong");
  });

  it("MODERN_HOLIDAY אחר (למשל יום הזיכרון) הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x2000, "Yom HaZikaron"))).toBe("light");
  });

  it("MINOR_HOLIDAY הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x80000, "Tu BiShvat"))).toBe("light");
  });

  it("EREV הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x100000, "Erev Rosh Hashana"))).toBe("light");
  });

  it("CHOL_HAMOED הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x200000, "Chol ha-Moed Pesach"))).toBe("light");
  });

  it("MAJOR_FAST הוא 'light' (תשעה-באב; יום-כיפור כבר מכוסה תחת CHAG)", () => {
    expect(categorizeHolidayEvent(mockEvent(0x4000, "Tish'a B'Av"))).toBe("light");
  });

  it("MINOR_FAST הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x100, "Tzom Gedaliah"))).toBe("light");
  });

  it("אירוע בלי אף דגל רלוונטי (למשל Rosh Chodesh לבדו) מוחזר null", () => {
    expect(categorizeHolidayEvent(mockEvent(0x80, "Rosh Chodesh Nisan"))).toBeNull();
  });
});

describe("getHolidayForDate", () => {
  it("ראש-השנה (1 תשרי) מוחזר כ-strong", async () => {
    const { HDate, months } = await import("@hebcal/core");
    const iso = toISODateLocal(new HDate(1, months.TISHREI, 5787).greg());
    const result = await getHolidayForDate(iso);
    expect(result?.category).toBe("strong");
  });

  it("יום-כיפור (10 תשרי) מוחזר כ-strong", async () => {
    const { HDate, months } = await import("@hebcal/core");
    const iso = toISODateLocal(new HDate(10, months.TISHREI, 5787).greg());
    const result = await getHolidayForDate(iso);
    expect(result?.category).toBe("strong");
  });

  it("יום-העצמאות (תאריך אמיתי, נע כל שנה - לא HDate קבוע) מוחזר כ-strong", async () => {
    // התאריך של יום-העצמאות זז כל שנה (5 באייר, שנדחה כשחל בסמוך לשבת) - לכן, בניגוד
    // לראש-השנה/יום-כיפור שחלים בתאריך עברי קבוע, מאתרים אותו בפועל מול הספרייה
    // (getHolidaysForYear) במקום לבנות HDate עם יום קבוע. זו הבדיקה שהייתה תופסת
    // את באג-הגרש החסר במחרוזת ("Yom HaAtzmaut" מול "Yom HaAtzma'ut") לפני מיזוג.
    const { HebrewCalendar } = await import("@hebcal/core");
    const yearEvents = HebrewCalendar.getHolidaysForYear(5787);
    let atzmautDate: Date | undefined;
    for (const events of yearEvents.values()) {
      const ev = events.find(e => e.basename() === "Yom HaAtzma'ut");
      if (ev) { atzmautDate = ev.getDate().greg(); break; }
    }
    if (!atzmautDate) throw new Error("Yom HaAtzma'ut לא נמצא בשנה 5787 - לבדוק גרסת @hebcal/core");
    const result = await getHolidayForDate(toISODateLocal(atzmautDate));
    expect(result?.category).toBe("strong");
  });

  it("יום-חול רגיל (15 כסלו תשפ\"ז) מוחזר null", async () => {
    // אמצע הפער בין "יום בן-גוריון" (16 בנובמבר 2026) ל"חנוכה" (4 בדצמבר 2026) -
    // מאומת אמפירית מול @hebcal/core (getHolidaysOnDate עם דגל ישראל) שכל 17 הימים
    // שביניהם ריקים מאירועים; 15 בכסלו נמצא בדיוק באמצע, עם שולי-בטיחות בשני הכיוונים.
    const { HDate, months } = await import("@hebcal/core");
    const midKislev = new HDate(15, months.KISLEV, 5787).greg();
    const result = await getHolidayForDate(toISODateLocal(midKislev));
    expect(result).toBeNull();
  });
});
