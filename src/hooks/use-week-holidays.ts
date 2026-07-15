import { useEffect, useState } from "react";
import { getHolidayForDate, HolidayInfo } from "@/lib/holidays";

// טוען מידע-חג לכל ימי השבוע הנוכחיים, אסינכרונית (כי @hebcal/core נטען דינמית).
// לפני שהטעינה מסתיימת מוחזרת מפה ריקה - אין מצב-טעינה נראה בטבלה.
export function useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null> {
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo | null>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(weekDays.map(async date => [date, await getHolidayForDate(date)] as const))
      .then(entries => {
        if (!cancelled) setHolidays(Object.fromEntries(entries));
      })
      .catch(err => {
        // כשל בטעינת @hebcal/core (או בבעיה אחרת) לא אמור לשבור את הטבלה -
        // רק לדווח, כדי שהעדר-חגים בממשק יהיה ניתן לאבחון ולא שקט-לגמרי.
        console.error("טעינת חגים נכשלה:", err);
      });
    return () => { cancelled = true; };
  }, [weekDays.join(",")]);

  return holidays;
}
