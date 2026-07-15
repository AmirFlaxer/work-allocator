# הוגנות בין-שבועית באלגוריתם השיבוץ - עיצוב

תאריך: 2026-07-15
סטטוס: מאושר

## רקע ובעיה

`generateWeeklySchedule` (`src/lib/scheduler.ts`) כבר משתמש בפונקציית `leastLoaded` כדי לשבור תיקו בין מועמדים שווים - אבל היא מסתכלת רק על העומס **בתוך השבוע הנוכחי** (`getAssignedCount`, ימים עם משמרת בשבוע הזה בלבד). עובד שקיבל הרבה משמרות בשבועות האחרונים ועובד שקיבל מעט - שניהם מתחילים "מאפס" בכל שבוע חדש. אין שום זיכרון בין שבועות, למרות שהארכיון ההיסטורי (`savedSchedules`) כבר קיים וזמין.

## מטרה

כשהאלגוריתם בוחר בין כמה מועמדים זהים (לפי הכללים הקיימים - זמינות, ימי-חופש, מקסימום שבועי וכו'), להעדיף את מי שקיבל פחות משמרות ב-4 השבועות האחרונים שנשמרו. שינוי שקוף לגמרי - בלי ממשק חדש.

## עיצוב

### 1. חישוב עומס היסטורי

פונקציה חדשה ב-`src/lib/scheduler.ts`:

```ts
export function calculateRecentLoad(
  savedSchedules: SavedSchedule[],
  currentWeekStart: Date,
  weekCount = 4
): Map<string, number>
```

לוגיקה:
1. דה-דופ - שבוע-לוח (weekKey) אחד לכל שמירה, נשארת רק השמירה האחרונה (`savedAt` מאוחר ביותר) לכל שבוע - מונע ספירה כפולה כששבוע נשמר כמה פעמים (טיוטה + סופי).
2. סינון לשבועות שה-weekKey שלהם **קודם** ל-weekKey של `currentWeekStart` (לא כולל את השבוע הנוכחי עצמו).
3. מיון יורד לפי weekKey, לקיחת `weekCount` (4) השבועות האחרונים.
4. סכימת הופעות שם עובד בכל תא (`cellNames`) על פני השבועות שנבחרו - מפתח המפה הוא שם העובד (`name`), כמו בכל שאר האתחום שמתאים שיבוץ לעובד (התאמה לפי שם, לא id - עקבי עם `viewerShifts` ב-`share.ts` וההגבלה המתועדת שם).

**Refactor נלווה:** לוגיקת ה-dedup (שבוע-לוח אחד, השמירה האחרונה) כבר קיימת כ-`latestPerWeek` בתוך `src/components/MonthlyReport.tsx`. מעבירים אותה ל-`src/lib/week.ts` (מיוצאת, שם כללי כמו `latestSchedulePerWeek`) כדי לא לשכפל; `MonthlyReport.tsx` ו-`scheduler.ts` שניהם ייבאו משם. **תיקון אגבי בהעברה:** המימוש הקיים מחשב את מפתח השבוע עם `new Date(s.weekStart)` - פרסור תאריך-בלבד כ-UTC-חצות, אותו באג-timezone שתועד ותוקן כמה פעמים בפרויקט (ראו `parseISODate` ב-`week.ts:25-27`). בהעברה מחליפים ל-`parseISODate(s.weekStart)`. זה גם מתקן שגיאת-קצה שקטה בדוחות-השכר הקיימים (שבוע עלול להיספר תחת התאריך הלא-נכון ב-timezone שלילי).

### 2. שילוב ב-`generateWeeklySchedule`

פרמטר אופציונלי חדש בסוף רשימת הפרמטרים:

```ts
export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>,
  savedSchedules?: SavedSchedule[]   // חדש
): WeeklySchedule
```

הוספה בסוף (לא באמצע) - כל 9 קריאות הבדיקה הקיימות (`scheduler.test.ts`) ממשיכות לעבוד ללא שינוי; ללא הפרמטר, ההתנהגות זהה לחלוטין להיום (`calculateRecentLoad` לא נקראת / מפה ריקה).

בתוך הפונקציה: `const recentLoad = savedSchedules ? calculateRecentLoad(savedSchedules, weekStart) : new Map();` - נגישה לכל השלבים.

### 3. שינויים בפסים (passes)

- **שלבים 1, 3** (בקשות ספציפיות) - **ללא שינוי**. אין שם בחירה בין מועמדים.
- **שלב 2** (עובדים מכוכבים, ממוין `minWeeklyShifts` יורד) - הסדר הראשי נשאר `minWeeklyShifts` יורד (דרישת מינימום, לא נוגעים). מוסיפים קריטריון-מיון שני (secondary sort key): בין עובדים עם אותו `minWeeklyShifts`, מי שיש לו `recentLoad` נמוך יותר קודם.
- **שלב 4** (עובדים לא-מכוכבים, `employees.filter(emp => !emp.hasStar)`) - היום ללא מיון (סדר-רשימה). ממיינים את הרשימה עולה לפי `recentLoad` (לפני תחילת הלולאה, מיון סטטי חד-פעמי - לא מחושב-מחדש תוך כדי, כי בכל מקרה כל עובד מטופל פעם אחת לכל השבוע בשלב הזה).
- **שלבים 5, 6** (`leastLoaded`) - `leastLoaded` מקבל קריטריון-השוואה חדש: `getAssignedCount(emp.id) + (recentLoad.get(emp.name) ?? 0)` במקום `getAssignedCount(emp.id)` בלבד. עובד בלי היסטוריה (חדש) = `recentLoad` 0 = עדיפות טבעית, התנהגות רצויה.

### 4. בדיקות (TDD)

ב-`src/lib/week.test.ts` (או קובץ קיים מתאים): בדיקות ל-`latestSchedulePerWeek` המועברת (דה-דופ, וסדר-timezone נכון לאחר המעבר ל-`parseISODate`).

ב-`src/lib/scheduler.test.ts`: 
- `calculateRecentLoad` - סכימה נכונה על פני 4 שבועות, החרגת השבוע הנוכחי, דה-דופ שבוע-כפול.
- אינטגרציה: שני עובדים זהים בכל הקריטריונים הקיימים (זמינות, אין בקשות, לא-מכוכבים) אבל אחד עם היסטוריה גבוהה יותר ב-`savedSchedules` - מוודאים שהעובד עם ההיסטוריה הנמוכה יותר מקבל את המשמרת.
- Backward-compat: קריאה ל-`generateWeeklySchedule` בלי הפרמטר החדש (כמו 9 הבדיקות הקיימות) מניבה תוצאה זהה למצב לפני השינוי.

### 5. חיבור ב-`Index.tsx`

קריאה קיימת ל-`generateWeeklySchedule` (שורה ~523) - מוסיפים ארגומנט אחרון `savedSchedules` (כבר קיים כ-state בקומפוננטה, שורה 188).

## מחוץ לתחולה

- אין ממשק משתמש חדש (לא טולטיפ, לא תצוגת עומס-היסטורי) - הוחלט מפורשות.
- אין הגדרת-משקל ניתנת לעריכה (4 שבועות קבוע בקוד, לא UI).
- לא נוגעים בפסים 1/3 (בקשות ספציפיות) ולא בסדר הראשי של שלב 2 (`minWeeklyShifts`).
