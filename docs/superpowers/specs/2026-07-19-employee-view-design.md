# תצוגה הפוכה לפי עובדים - עיצוב (בקלוג #10)

**תאריך:** 2026-07-19
**סטטוס:** מאושר ע"י אמיר

## מהות

מתג "תצוגה לפי עובדים" בטבלת השיבוץ: שורות = עובדים, עמודות = ימי השבוע, תא = שמות
העמדות של העובד באותו יום. צפייה בלבד (עריכה - בתצוגה הרגילה). נוח להדפסה לחדר צוות.

## הכרעות אמיר

1. **צפייה בלבד** - אין גרירה/נעילה/עריכה בתצוגה ההפוכה.
2. עמודת סה"כ + שמירת המתג כמו cellColors - מאושר.

## רכיבים

### לוגיקה טהורה - `src/lib/employeeView.ts` (+ בדיקות)

```ts
export interface EmployeeViewRow {
  name: string;
  /** לכל יום: שמות העמדות שהעובד משובץ בהן (ריק = לא משובץ) */
  stationsPerDay: string[][];
  total: number;
}

export function buildEmployeeViewRows(
  employees: Employee[],
  stations: Station[],
  schedule: WeeklySchedule,
  weekDays: string[],
): EmployeeViewRow[]
```

- שורה לכל עובד לפי סדר מערך העובדים (גם עובדים בלי משמרות - שורה ריקה).
- התאמה לפי שם (מוסכמת המודל הקיימת; שני עובדים באותו שם - שניהם יראו אותו שיבוץ).
- עובד בשתי עמדות באותו יום - שתי העמדות בתא.
- total = מספר ימים עם לפחות משמרת אחת (עקבי עם ספירת "עומס עובדים השבוע").

### קומפוננטה - `src/components/EmployeeScheduleView.tsx`

- props: `employees`, `stations`, `schedule`, `weekStart`, `activeDays`.
- טבלה בסגנון הקיים: כותרות יום+תאריך (בלי חגים - פשטות), עמודה ראשונה שם העובד עם
  נקודת-הצבע האישית (getEmployeeColor), תא = שמות עמדות מופרדים בפסיק או מקף עמום
  כשריק, עמודת "סה\"כ" אחרונה.
- אין אינטראקציות (למעט hover עדין).

### חיווט - `src/pages/Index.tsx`

- state חדש `employeeView: boolean` - נשמר ומסונכרן בדיוק כמו `cellColors`
  (localStorage + syncToSupabase + טעינה + realtime, key: `"employeeView"`).
- Switch "תצוגה לפי עובדים" לצד "צבע לעובד".
- בתוך מכל `#schedule-table`: אם `employeeView` - מרונדרת `EmployeeScheduleView`
  במקום `ScheduleTable`. כך ייצוא PNG והדפסה תופסים את התצוגה הפעילה, ואזהרת
  המשבצות-הריקות (#9) ממשיכה לחול על הייצוא.

## בדיקות

vitest ל-buildEmployeeViewRows: עובד עם משמרות בכמה ימים · שתי עמדות באותו יום ·
עובד בלי משמרות (שורה ריקה, total 0) · total נכון · סדר שורות = סדר העובדים.

## תיעוד

משפט בסעיף הטבלה במדריך + PDF מחדש.

## מחוץ לתחום (YAGNI)

עריכה בתצוגה ההפוכה · מיון/סינון · חגים בכותרות התצוגה ההפוכה.
