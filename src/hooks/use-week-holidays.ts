import { useMemo } from "react";
import { getHolidayForDate, HolidayInfo } from "@/lib/holidays";

// מידע-החג לכל ימי השבוע. היה כאן useEffect אסינכרוני כי @hebcal/core נטענה
// ב-import דינמי, והטבלה הבהבה בלי חגים עד שהטעינה הסתיימה. מאז שהמקור הוא
// טבלה סטטית הנתונים זמינים מיד, ולכן useMemo פשוט - בלי מצב-ביניים ובלי
// מסלול-כשל שצריך לטפל בו.
export function useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null> {
  const key = weekDays.join(",");
  return useMemo(
    () => Object.fromEntries(weekDays.map(date => [date, getHolidayForDate(date)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
}
