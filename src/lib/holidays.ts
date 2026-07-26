import holidayData from "@/data/israeli-holidays.json";

// ── מקור הנתונים ────────────────────────────────────────────────────────────
// טבלה סטטית שנוצרת ע"י scripts/generate-holidays.mjs מ-date-holidays
// (ISC AND CC-BY-3.0). קודם לכן ישבה כאן @hebcal/core, שהיא GPL-2.0 בלי
// חריג-קישור ונשלחה לדפדפן של כל משתמש כ-chunk של 164KB. הטבלה שוקלת 7KB
// אחרי gzip, אין בה ספרייה כלל, והיא נטענת סינכרונית - בלי import דינמי
// ובלי קריאת-רשת.
//
// הכיסוי אינו אינסופי; holidays.test.ts נכשלת כשהוא מתקרב לסופו.
// ──────────────────────────────────────────────────────────────────────────────

export type HolidayCategory = "strong" | "light";
export interface HolidayInfo { name: string; category: HolidayCategory; }

interface HolidayData {
  firstYear: number;
  lastYear: number;
  days: Record<string, [string, HolidayCategory]>;
}

const data = holidayData as unknown as HolidayData;

export const holidayCoverage = { firstYear: data.firstYear, lastYear: data.lastYear };

/**
 * strong = יום שבו לא עובדים (חג מלא). light = יום-ציון או ערב-חג שכדאי
 * לראות בלוח אבל עובדים בו. null = יום רגיל, או תאריך מחוץ לטווח הטבלה.
 */
export function getHolidayForDate(dateISO: string): HolidayInfo | null {
  const entry = data.days[dateISO];
  if (!entry) return null;
  const [name, category] = entry;
  return { name, category };
}
