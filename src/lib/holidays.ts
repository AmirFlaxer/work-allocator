import { parseISODate } from "@/lib/week";

export type HolidayCategory = "strong" | "light";
export interface HolidayInfo { name: string; category: HolidayCategory; }

interface CategorizableEvent {
  getFlags(): number;
  basename(): string;
}

// ערכי הביטים מתוך @hebcal/core (מתועדים, לא מספרי-קסם):
// CHAG=0x1 (יום-טוב, ללא עבודה) · MODERN_HOLIDAY=0x2000 (יום-העצמאות/הזיכרון/השואה/ירושלים)
// MAJOR_FAST=0x4000 (יום-כיפור - כבר מכוסה ע"י CHAG - ותשעה-באב) · MINOR_HOLIDAY=0x80000
// EREV=0x100000 (ערב-חג) · CHOL_HAMOED=0x200000 · MINOR_FAST=0x100
const CHAG = 0x1;
const MODERN_HOLIDAY = 0x2000;
const LIGHT_MASK = 0x80000 /* MINOR_HOLIDAY */ | 0x100000 /* EREV */ | 0x200000 /* CHOL_HAMOED */
  | 0x4000 /* MAJOR_FAST */ | 0x100 /* MINOR_FAST */ | MODERN_HOLIDAY;

// יום-העצמאות אינו מסומן CHAG ב-hebcal (הוא MODERN_HOLIDAY, כמו יום-הזיכרון/השואה/ירושלים
// שהם ימי-עבודה רגילים) - זה מקרה-פרטי-ידני, כי בפועל הוא יום-חופש לאומי.
export function categorizeHolidayEvent(ev: CategorizableEvent): HolidayCategory | null {
  const f = ev.getFlags();
  if ((f & CHAG) !== 0 || ev.basename() === "Yom HaAtzmaut") return "strong";
  if ((f & LIGHT_MASK) !== 0) return "light";
  return null;
}

export async function getHolidayForDate(dateISO: string): Promise<HolidayInfo | null> {
  const { HebrewCalendar } = await import("@hebcal/core");
  const events = HebrewCalendar.getHolidaysOnDate(parseISODate(dateISO), true) ?? [];
  const categorized = events
    .map(ev => ({ ev, category: categorizeHolidayEvent(ev) }))
    .filter((x): x is { ev: (typeof events)[number]; category: HolidayCategory } => x.category !== null);
  if (categorized.length === 0) return null;
  const chosen = categorized.find(x => x.category === "strong") ?? categorized[0];
  return { name: chosen.ev.render("he"), category: chosen.category };
}
