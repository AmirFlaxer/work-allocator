# עיצוב: ימי עבודה לבחירה + מספר עובדים לעמדה

**תאריך**: 2026-06-29
**סטטוס**: אושר עקרונית (מודל מערך + בורר בלשונית עמדות), ממתין לאישור ספק מלא

## מטרה

שתי תוספות עצמאיות למערכת השיבוץ:

1. **ימי עבודה לבחירה חופשית** - היום השבוע מקודד קשיח ל-5 ימים רצופים (א-ה). המשתמש יוכל לבחור אילו ימים נחשבים שבוע (למשל א-ו, ב-ו, או דילוג על יום באמצע). ברירת מחדל: א-ה.
2. **מספר עובדים לעמדה** - היום כל עמדה מאיישת עובד יחיד ביום. המשתמש יוכל לקבוע לכל עמדה כמה עובדים נדרשים בו-זמנית. ברירת מחדל: 1.

## עיקרון מנחה

לרכז את הלוגיקה המשוכפלת למודול אחד (`src/lib/week.ts`) במקום 4-7 העתקים. כל הקבצים ייבאו ממנו. כך כל תוספת הופכת מ"שינוי ב-7 מקומות" ל"שינוי במקום אחד + חיווט".

## מצב קיים (מה שכל שינוי נוגע בו)

- `getWeekDays` ו-`HEBREW_DAYS` (5 ימים) משוכפלים ב-[Index.tsx](../../../src/pages/Index.tsx), [ScheduleTable.tsx](../../../src/components/ScheduleTable.tsx), [scheduler.ts](../../../src/lib/scheduler.ts), [WeeklyPreferences.tsx](../../../src/components/WeeklyPreferences.tsx), ו-inline בייצוא Excel.
- `schedule[date][stationId]` הוא `string` (עובד יחיד). מוטמע ב: scheduler, ScheduleTable, חישוב עומסים, נעילות, היסטוריה (audit), גרירה/החלפה, ייצוא Excel/PNG, MonthlyReport, ScheduleChanges.
- `weekStart` הוא תמיד ראשון (נוצר ע"י `getNextSunday`), נשמר ב-state ומסונכרן.
- דפוס הסנכרון: כל מפתח state מסונכרן ל-localStorage + Supabase + realtime, עם `hasLoaded`/`isRemoteUpdate` refs. רשימת `LOCAL_KEYS` ב-Index קובעת מה נטען/מאופס.

## מודול חדש: `src/lib/week.ts`

מרכז את כל לוגיקת הימים וקריאת התאים:

```typescript
export const ALL_HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const DEFAULT_ACTIVE_DAYS = [0, 1, 2, 3, 4]; // א-ה

// מעגן לראשון של השבוע המכיל את weekStart, ומחזיר תאריך לכל יום פעיל (ממוין)
export function getWeekDays(weekStart: Date, activeDays: number[]): string[];

// תוויות עבריות לימים הפעילים, באותו סדר כמו getWeekDays
export function getHebrewDayLabels(activeDays: number[]): string[];

// תאימות לאחור: מקבל string או string[] ומחזיר תמיד מערך
export function cellNames(cell: string | string[] | undefined): string[];

// מספר הסלוטים של עמדה (requiredCount עם ברירת מחדל 1)
export function stationSlots(station: Station): number;

// מפתח תא כולל סלוט
export function cellKey(date: string, stationId: number, slotIndex: number): string;
```

`getWeekDays` מתוקן להיות עמיד: מעגן ל-`sunday = weekStart - weekStart.getDay()` ואז `date = sunday + weekdayIndex` לכל יום פעיל. כך גם אם weekStart נטען ולא בדיוק ראשון, התוצאה נכונה.

## תוספת 1: ימי עבודה לבחירה

### Data / State
- State חדש `activeDays: number[]` ב-Index, ברירת מחדל `DEFAULT_ACTIVE_DAYS`.
- מסונכרן בדיוק כמו `cellColors`: useEffect ל-localStorage + `syncToSupabase("activeDays", ...)`, נטען ב-mount, מטופל ב-realtime, מאופס ב-org ריקה. מתווסף ל-`LOCAL_KEYS`.

### UI
- כרטיס "ימי עבודה" בראש לשונית **עמדות** (לפני StationManager): 7 צ'קבוקסים (א-ש), כל סימון מעדכן `activeDays`. לפחות יום אחד חייב להישאר מסומן.

### חיווט
- כל קריאה ל-`getWeekDays(weekStart)` המקומית מוחלפת ב-`getWeekDays(weekStart, activeDays)` מהמודול.
- `HEBREW_DAYS` מוחלף ב-`getHebrewDayLabels(activeDays)`.
- קבצים מושפעים: Index (חישובי עומס/ריקות/ייצוא/clone/template), ScheduleTable (כותרות + עמודות), WeeklyPreferences (ימים לא זמינים + בקשות), ScheduleChanges (iterate by active days), scheduler (פסי המילוי).
- `formatWeekRange` ב-Index יחושב מהיום הפעיל הראשון עד האחרון.

### התנהגות
- כשמבטלים יום, השיבוץ הקיים עשוי להכיל מפתח תאריך ליום שכבר לא פעיל - הוא פשוט לא מוצג ולא נספר. הגנרציה הבאה מייצרת רק ימים פעילים. אין צורך במחיקה אקטיבית.

## תוספת 2: מספר עובדים לעמדה

### Data / State
- `Station` מקבל `requiredCount?: number` (ברירת מחדל 1 כש-undefined, דרך `stationSlots()`).
- `WeeklySchedule` משתנה: `{ [date]: { [stationId]: string[] } }` (מערך באורך requiredCount). הקריאה תמיד דרך `cellNames()` כדי לתמוך בנתונים ישנים (`string`).

### UI - StationManager
- שדה מספר ("עובדים נדרשים", מינ' 1) ליד שם העמדה, גם בהוספה וגם בעריכה. `onAdd`/`onEdit` מקבלים גם count.

### UI - ScheduleTable
- עמדה עם `requiredCount = N` תופסת N שורות (שורה לכל סלוט). מספר השורות נגזר מ-`stationSlots(station)`, **לא** מאורך המערך - כך שינוי requiredCount משתקף מיד גם על שיבוץ קיים.
- כל תא-סלוט: ערך = `cellNames(schedule[date][stationId])[slotIndex] ?? ""`. עריכה/גרירה/נעילה/היסטוריה לכל סלוט בנפרד דרך `cellKey(date, stationId, slotIndex)`.
- עמודת שם העמדה: rowSpan על פני שורות הסלוטים (תווית אחת לעמדה), עם ציון מספר הסלוט.

### Scheduler
- הסקדולר נבנה מחדש לחשוב ב"תאים" = (date, stationId, slotIndex). לכל עמדה ביום צריך למלא `stationSlots(station)` סלוטים, כל אחד בעובד שונה.
- נשמר האילוץ "עובד אחד למשמרת ליום" (`employeeAssignments[emp][date]` בוליאני) - עובד לא תופס שני סלוטים באותו יום, גם לא בעמדות שונות.
- `canPlace`, הנעילות, ובקשות ספציפיות עוברים לעבוד ברמת סלוט (בקשה ספציפית משובצת לסלוט הפנוי הראשון של העמדה).

### Index - handlers
- `handleCellEdit(date, stationId, slotIndex, name)` - כותב לאינדקס הסלוט (עם padding למערך לפי הצורך). בדיקת שיבוץ-כפול ומקסימום-משמרות עוברות לעבוד מול `cellNames` על כל הסלוטים.
- `handleSwapCells` - מקבל slotIndex לשני הצדדים.
- `handleToggleLock` - מפתח כולל slotIndex.
- `addAuditEntry` - מפתח כולל slotIndex.
- `emptySlots`, `workloadData`, `calculateWorkloads` - שטוחים דרך `cellNames` על כל הסלוטים.
- clone/template - מעתיקים מערכי סלוטים כמו שהם.

### תאימות לאחור
- שיבוצים שמורים בארכיון ובדוחות מכילים `string`. `cellNames()` קורא גם `string` וגם `string[]`. MonthlyReport ו-ScheduleChanges עוברים דרכו, כך שכל הנתונים ההיסטוריים ממשיכים לעבוד בלי מיגרציה.

## סדר ביצוע (שני שלבים)

- **שלב 1** - מודול `week.ts` + ימי עבודה לבחירה. עצמאי, סיכון נמוך.
- **שלב 2** - מערך עובדים לעמדה. נשען על שלב 1.

## מחוץ להיקף (YAGNI)

- אין requiredCount שונה לפי יום (מספר קבוע לעמדה).
- אין מקסימום עובדים לעמדה מעבר ל"נדרש" (הסלוטים = בדיוק requiredCount).
- אין מיגרציה אקטיבית של נתונים ישנים (קריאה דפנסיבית בלבד).

## בדיקה / אימות

- שלב 1: בחירת ימים שונה (כולל דילוג יום) מציגה את העמודות הנכונות בטבלה, בהעדפות, ובייצוא; הגנרציה ממלאת רק ימים פעילים.
- שלב 2: עמדה עם requiredCount=3 מציגה 3 שורות; גנרציה ממלאת 3 עובדים שונים; עריכה/גרירה/נעילה/היסטוריה פר-סלוט; שיבוץ ישן (string) מהארכיון נטען ומוצג נכון.
- בנייה: `npm run build` עובר ללא שגיאות TypeScript.
