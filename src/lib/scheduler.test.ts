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

  it("שלב 4: מעדיף עובד עם עומס-עבר נמוך יותר, לא לפי סדר הרשימה", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [
      emp({ id: "a", name: "אבי" }), // ראשון ברשימה - בלי הוגנות היה זוכה קודם
      emp({ id: "b", name: "בני" }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1], undefined, undefined, saved);
    expect(namesAt(schedule, days[0], 1)).toEqual(["בני"]);
  });

  it("שלב 2: בין מכוכבים עם אותו minWeeklyShifts, עומס-עבר שובר תיקו", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const employees = [
      emp({ id: "a", name: "אבי", hasStar: true, minWeeklyShifts: 1, maxWeeklyShifts: 1 }),
      emp({ id: "b", name: "בני", hasStar: true, minWeeklyShifts: 1, maxWeeklyShifts: 1 }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0, 1], undefined, undefined, saved);
    expect(namesAt(schedule, days[0], 1)).toEqual(["בני"]);
  });

  it("שלבים 5-6 (leastLoaded): עומס-עבר משפיע גם על משמרת שנייה באותו יום", () => {
    const [day] = getWeekDays(WEEK_START, [0]);
    const employees = [
      emp({ id: "a", name: "אבי", maxDailyShifts: 2 }),
      emp({ id: "b", name: "בני", maxDailyShifts: 2 }),
    ];
    const priorWeek = weekOf(2026, 6, 5);
    const saved = [savedWeek(priorWeek, "2026-07-06T08:00:00.000Z", { "אבי": 1 })];
    // עמדה 1 (2 משבצות) מתמלאת בשלב 4 - אבי ובני, אחד כל אחד. המשבצת היחידה
    // של עמדה 2 נותרת לשלב 6 (משמרת שנייה באותו יום למי שכבר עבד) - שם בני
    // (עומס כולל 0+1=1) עדיף על אבי (עומס כולל 1+1=2) ומקבל אותה.
    const schedule = generateWeeklySchedule(employees, [st(1, 2), st(2, 1)], WEEK_START, [0], undefined, undefined, saved);
    expect(namesAt(schedule, day, 1).sort()).toEqual(["אבי", "בני"]);
    expect(namesAt(schedule, day, 2)).toEqual(["בני"]);
  });

  describe("העדפות רכות (מעדיף שלא)", () => {
    it("מעדיף-שלא לא משובץ כשיש עובד חלופי", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({ id: "a", name: "אבי", preferNotDays: [day] }),
        emp({ id: "b", name: "בני" }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual(["בני"]);
    });

    it("משמרת-כפולה של עובד אחר עדיפה על שבירת מעדיף-שלא", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({ id: "a", name: "אבי", preferNotDays: [day] }),
        emp({ id: "b", name: "בני", maxDailyShifts: 2 }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1), st(2)], WEEK_START, [0]);
      // שלב 6 (משמרת שנייה לבני) רץ לפני שלבים 7-8 - אבי לא משובץ בכלל
      expect(namesAt(schedule, day, 1)).toEqual(["בני"]);
      expect(namesAt(schedule, day, 2)).toEqual(["בני"]);
    });

    it("כשאין ברירה - מעדיף-שלא כן משובץ והמשבצת לא נשארת ריקה", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [emp({ id: "a", name: "אבי", preferNotDays: [day] })];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual(["אבי"]);
    });

    it("לא-זמין קשיח לא משובץ לעולם, גם כשאין ברירה", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [emp({ id: "a", name: "אבי", unavailableDays: [day] })];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual([""]);
    });

    it("בקשה ספציפית גוברת על מעדיף-שלא", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({
          id: "a", name: "אבי", hasStar: true, minWeeklyShifts: 1,
          preferNotDays: [day], specificRequests: [{ date: day, stationId: 1 }],
        }),
        emp({ id: "b", name: "בני" }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      // בלי העדפת-הבקשה, אבי היה נחסם בשלבים 1-2 ובני היה תופס את המשבצת
      expect(namesAt(schedule, day, 1)).toEqual(["אבי"]);
    });
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

// הפאסים 1-8 הם greedy עובד-אחר-עובד ונכנסים רק למשבצות ריקות. עובד שזמין
// במעט עמדות מפסיד אותן לעובדים גמישים שהגיעו קודם ונשאר על 0 - גם כשקיים
// שיבוץ חוקי שמכבד את כולם. נצפה בבדיקה מקצה-לקצה 26/7: עובדת עם מינימום 1
// קיבלה 0 משמרות בשבוע שכל 20 משבצותיו התמלאו.
describe("פאס-תיקון: מינימום שבועי שלא הושג", () => {
  it("עובד מוגבל-עמדות מקבל את המינימום שלו מעובד גמיש שיש לו עודף", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const flexible = emp({ id: "a", name: "אבי" });
    const restricted = emp({ id: "b", name: "גל", availableStations: [1], minWeeklyShifts: 1 });
    const schedule = generateWeeklySchedule([flexible, restricted], [st(1)], WEEK_START, [0, 1]);
    const workloads = calculateWorkloads(schedule);
    expect(workloads["גל"]).toBeGreaterThanOrEqual(1);
    expect(workloads["אבי"]).toBeGreaterThanOrEqual(1);
    // אף משבצת לא אבדה בהחלפה
    expect(countFilledSlots(schedule)).toBe(days.length);
  });

  it("לא לוקח ממי שנמצא בדיוק על המינימום שלו - לא פותחים חור כדי לסתום חור", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const onMinimum = emp({ id: "a", name: "אבי", minWeeklyShifts: 1 });
    const starved = emp({ id: "b", name: "גל", availableStations: [1], minWeeklyShifts: 1 });
    const schedule = generateWeeklySchedule([onMinimum, starved], [st(1)], WEEK_START, [0]);
    // משבצת אחת, שני עובדים עם מינימום 1 - אי אפשר לספק את שניהם.
    // הדרישה: המשבצת נשארת מאוישת ואיש לא מודח לטובת השני.
    expect(namesAt(schedule, days[0], 1)).toEqual(["אבי"]);
  });

  it("התורם נקלט מחדש - ההחלפה לא מותירה משבצת ריקה שהוא יכול למלא", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const flexible = emp({ id: "a", name: "אבי" });
    const restricted = emp({ id: "b", name: "גל", availableStations: [1], minWeeklyShifts: 1 });
    const schedule = generateWeeklySchedule([flexible, restricted], [st(1), st(2)], WEEK_START, [0]);
    expect(namesAt(schedule, days[0], 1)).toEqual(["גל"]);
    expect(namesAt(schedule, days[0], 2)).toEqual(["אבי"]);
    expect(countFilledSlots(schedule)).toBe(2);
  });

  it("פאס-התיקון לא מפר יום 'לא זמין'", () => {
    const days = getWeekDays(WEEK_START, [0, 1]);
    const flexible = emp({ id: "a", name: "אבי" });
    const restricted = emp({
      id: "b", name: "גל", availableStations: [1], minWeeklyShifts: 2,
      unavailableDays: [days[0]],
    });
    const schedule = generateWeeklySchedule([flexible, restricted], [st(1)], WEEK_START, [0, 1]);
    expect(namesAt(schedule, days[0], 1)).not.toContain("גל");
  });

  it("פאס-התיקון לא חורג מהמקסימום השבועי של המקבל", () => {
    const flexible = emp({ id: "a", name: "אבי" });
    const capped = emp({
      id: "b", name: "גל", availableStations: [1],
      minWeeklyShifts: 4, maxWeeklyShifts: 1,
    });
    const schedule = generateWeeklySchedule([flexible, capped], [st(1)], WEEK_START, DEFAULT_ACTIVE_DAYS);
    expect(calculateWorkloads(schedule)["גל"]).toBe(1);
  });
});

// גם אחרי פאס-התיקון, כל הפאסים עדיין רק **מוסיפים** למשבצות ריקות. משבצת
// שאפשר למלא רק ע"י הזזת עובד קיים ממקום למקום נשארת ריקה - גם כשאיש לא
// מפר מינימום ולכן שלב 9 אינו נכנס לפעולה כלל. נצפה בבדיקה מקצה-לקצה 26/7:
// שיבוץ עם משבצת ריקה אחת שהייתה פתירה בהזזה אחת.
describe("פאס-שרשור: משבצת שנפתרת רק בהזזת עובד קיים", () => {
  it("עובד גמיש מוזז לעמדה שרק הוא יכול, והמוגבל נכנס במקומו", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const flexible = emp({ id: "a", name: "אבי" });                              // כל העמדות
    const restricted = emp({ id: "b", name: "גל", availableStations: [1] });     // עמדה 1 בלבד
    // אבי תופס את עמדה 1 (הראשונה ברשימתו), גל נחסם, ועמדה 2 נשארת ריקה -
    // למרות שהחלפה אחת פותרת את שתיהן. לשניהם מינימום 0, ולכן שלב 9 לא נכנס.
    const schedule = generateWeeklySchedule([flexible, restricted], [st(1), st(2)], WEEK_START, [0]);
    expect(countFilledSlots(schedule)).toBe(2);
    expect(namesAt(schedule, days[0], 1)).toEqual(["גל"]);
    expect(namesAt(schedule, days[0], 2)).toEqual(["אבי"]);
  });

  it("לא מזיז עובד ליום שהוא חסום בו", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const flexible = emp({ id: "a", name: "אבי" });
    const blocked = emp({ id: "b", name: "גל", availableStations: [1], unavailableDays: [days[0]] });
    const schedule = generateWeeklySchedule([flexible, blocked], [st(1), st(2)], WEEK_START, [0]);
    // גל חסום, ולכן אין שרשור חוקי - אבי לבדו ממלא משבצת אחת והשנייה נשארת ריקה.
    expect(countFilledSlots(schedule)).toBe(1);
    expect(namesAt(schedule, days[0], 1)).not.toContain("גל");
    expect(namesAt(schedule, days[0], 2)).not.toContain("גל");
  });

  it("לא חורג ממקסימום שבועי בעת השרשור", () => {
    const days = getWeekDays(WEEK_START, [0]);
    const flexible = emp({ id: "a", name: "אבי" });
    const capped = emp({ id: "b", name: "גל", availableStations: [1], maxWeeklyShifts: 0 });
    const schedule = generateWeeklySchedule([flexible, capped], [st(1), st(2)], WEEK_START, [0]);
    expect(calculateWorkloads(schedule)["גל"]).toBeUndefined();
    expect(countFilledSlots(schedule)).toBe(1);
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

// שיבוצים שנשמרו לפני התיקון נושאים weekStart בפורמט חותמת-זמן מלאה
// (toISOString), ולא YYYY-MM-DD. בלי סובלנות לפורמט הזה כל הקוראים מקבלים
// Invalid Date, כל השבועות מתמוטטים למפתח אחד, והדוח החודשי מציג שבוע יחיד.
describe("תאימות-לאחור ל-weekStart בפורמט חותמת-זמן", () => {
  it("parseISODate מקבל חותמת-זמן מלאה ומחזיר את היום המקומי", () => {
    expect(toISODateLocal(parseISODate("2026-07-26T08:36:37.179Z"))).toBe("2026-07-26");
  });

  it("parseISODate ממשיך לקבל YYYY-MM-DD", () => {
    expect(toISODateLocal(parseISODate("2026-07-26"))).toBe("2026-07-26");
  });

  it("latestSchedulePerWeek לא ממוטט שבועות שונים שנשמרו כחותמת-זמן", () => {
    const saved: SavedSchedule[] = [
      { id: "1", name: "שבוע 30", schedule: {}, weekStart: "2026-07-19T08:36:37.179Z", savedAt: "2026-07-19T08:00:00.000Z" },
      { id: "2", name: "שבוע 31", schedule: {}, weekStart: "2026-07-26T08:36:37.179Z", savedAt: "2026-07-26T08:00:00.000Z" },
    ];
    expect(latestSchedulePerWeek(saved)).toHaveLength(2);
  });

  it("calculateRecentLoad סופר שבועות-קודמים שנשמרו כחותמת-זמן", () => {
    const saved: SavedSchedule[] = [
      { id: "1", name: "שבוע קודם", schedule: { "2026-07-05": { 1: ["אבי"] } }, weekStart: "2026-07-05T21:00:00.000Z", savedAt: "2026-07-06T08:00:00.000Z" },
    ];
    expect(calculateRecentLoad(saved, WEEK_START).get("אבי")).toBe(1);
  });
});
