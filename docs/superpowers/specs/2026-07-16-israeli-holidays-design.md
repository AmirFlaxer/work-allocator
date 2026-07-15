# חגים ישראליים אוטומטיים בטבלת השיבוץ - עיצוב

תאריך: 2026-07-16
סטטוס: מאושר

## רקע ובעיה

טבלת השיבוץ מציגה כותרת לכל יום (שם-יום, תאריך, סטאטוס-מלא/ריק) אבל אין שום אינדיקציה לחגים או מועדים. מנהל עלול לשבץ עובדים ביום שהוא בפועל חג (או להחמיץ שחול-המועד מצריך שיבוץ מצומצם) בלי שום רמז בטבלה עצמה.

## מטרה

סימון ויזואלי-שקוף (בלי דיאלוגים, בלי חסימות) של חגים ומועדים ישראליים בעמודת-הכותרת של כל יום בטבלה, עם הבחנה בין חג מלא (יום-עבודה מבוטל) למועד קל (יום-עבודה רגיל עם משמעות).

## עיצוב

### 1. מקור הנתונים - `@hebcal/core`

ספריית npm מתוחזקת המחשבת המרת לוח-עברי↔לועזי אלגוריתמית (לא טבלת-חיפוש) - מדויקת לכל שנה קדימה ואחורה בלי תלות בעדכון-ידני שנתי. רצה כולה בצד-לקוח, ללא קריאות-רשת.

**API רלוונטי (מאומת מול תיעוד הספרייה):**
```ts
import { HebrewCalendar, flags } from '@hebcal/core';
const events = HebrewCalendar.getHolidaysOnDate(date, true); // il=true: לוח ישראל
// events: HolidayEvent[] | undefined
// ev.getFlags(): number (bitmask) · ev.render('he'): string · ev.getDesc(): string
```

### 2. קטגוריזציה

**חזק** (`flags.CHAG`, ומקרה-פרטי ליום-העצמאות לפי `ev.getDesc() === "Yom HaAtzmaut"` - אינו מסומן `CHAG` ב-hebcal עצמו):
ראש-השנה (א׳+ב׳) · יום-כיפור · סוכות-א׳ · שמיני-עצרת/שמחת-תורה · פסח-א׳ · פסח-ז׳ · שבועות · יום-העצמאות.

**עדין** (`flags.MINOR_HOLIDAY | EREV | CHOL_HAMOED | MAJOR_FAST | MINOR_FAST | MODERN_HOLIDAY`, פחות יום-העצמאות שכבר סווג חזק):
ערבי כל החגים למעלה · חול-המועד פסח/סוכות · פורים, פורים-קטן, שושן-פורים, טו-בשבט, ל״ג-בעומר, טו-באב, פסח-שני וכו׳ (MINOR_HOLIDAY) · צום-גדליה, עשרה-בטבת, תענית-אסתר, י״ז-בתמוז (MINOR_FAST) · תשעה-באב (MAJOR_FAST - יום-כיפור כבר מכוסה תחת "חזק" דרך CHAG, כך שאין כפילות) · יום-הזיכרון, יום-השואה, יום-ירושלים (MODERN_HOLIDAY, ימי-עבודה רגילים).

אם כמה אירועים חלים באותו יום (נדיר) - סדר-עדיפות: חזק (CHAG/עצמאות) גובר על עדין; בתוך עדין, האירוע הראשון שמתקבל מ-hebcal.

### 3. `src/lib/holidays.ts` - המודול

```ts
export type HolidayCategory = "strong" | "light";
export interface HolidayInfo { name: string; category: HolidayCategory; }

export async function getHolidayForDate(dateISO: string): Promise<HolidayInfo | null>
```

- `import('@hebcal/core')` **דינמי בתוך הפונקציה** - hebcal יוצא ל-chunk נפרד (lazy), לא נטען עם ה-bundle הראשי.
- ממיר `dateISO` ל-`Date` דרך `parseISODate` (לא `new Date(iso)` - עקבי עם אילוץ-התאריכים של הפרויקט).
- קורא ל-`HebrewCalendar.getHolidaysOnDate(date, true)`, מסווג לפי הכללים בסעיף 2, מחזיר `{name: ev.render("he"), category}` או `null`.

### 4. `src/hooks/use-week-holidays.ts` - ה-hook

```ts
export function useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null>
```

טוען את החגים אסינכרונית (`useEffect` + `Promise.all` על `getHolidayForDate` לכל תאריך ב-`weekDays`) בכל שינוי של `weekDays`, שומר ב-state מקומי, ומחזיר מפה `date → HolidayInfo | null`. לפני שהטעינה מסתיימת - מפה ריקה (התא פשוט לא מציג כלום, בלי מצב-טעינה נראה).

### 5. תצוגה ב-`ScheduleTable.tsx`

בעמודת-הכותרת (`TableHead`) של כל יום, מתחת לתאריך הקיים ולפני/אחרי סטאטוס-מלא-ריק:

- **חזק**: הרקע של כל תא ה-`TableHead` מקבל `bg-warning/20`, ומתחת לתאריך מוצג שם-החג ב-`text-warning-foreground font-semibold text-xs`.
- **עדין**: רקע `bg-warning/8`, שם המועד ב-`text-muted-foreground text-xs`.
- אין חג: ללא שינוי מהתצוגה הקיימת.

שני הטונים משתמשים ב-token `warning` הקיים (`tailwind.config.ts`, מוגדר גם ל-light וגם ל-dark ב-`src/index.css:36-37,76-77`) - אין צבע קשיח, dark-mode אוטומטי.

## בדיקות

`src/lib/holidays.test.ts` - בדיקות ל-`getHolidayForDate`:
- תאריך ידוע של חג-חזק (למשל ראש-השנה תשפ״ז) → `category: "strong"`, שם נכון.
- תאריך ידוע של מועד-עדין (למשל פורים) → `category: "light"`.
- תאריך ידוע של ערב-חג → `category: "light"`.
- תאריך-חול רגיל (לא סמוך לשום חג) → `null`.
- יום-העצמאות (המקרה-הפרטי הידני) → `category: "strong"`.

אין בדיקת unit ל-`useWeekHolidays` עצמו (עקבי עם מוסכמת הפרויקט - אין בדיקות-unit ל-hooks/קומפוננטות, `src/hooks/` ריק מבדיקות כיום) ולא ל-`ScheduleTable.tsx` (קומפוננטת-עמוד, לא נבדקת ב-unit). אימות ויזואלי-ידני (Playwright/עין) על שבוע שמכיל חג-חזק וחג-עדין לפני מיזוג.

## מחוץ לתחולה

- אין דיאלוג-אזהרה/חסימה בעת שיבוץ-בפועל ביום-חג (הוחלט מפורשות - רק סימון ויזואלי).
- אין preview-deployment של תצוגות-מקדימה לענפים (מחוץ לפיצ'ר זה).
- אין הגדרת-קונפיג למשתמש (אילו חגים לסמן) - הרשימה קבועה בקוד.
