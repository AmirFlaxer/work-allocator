# דיווח היעדרות / מחלה - עיצוב

**תאריך:** 2026-07-19
**סטטוס:** מאושר ע"י אמיר (העיצוב הוצג ואושר בצ'אט)

## מהות

עובד שחלה **אחרי שהשיבוץ פורסם** מדווח על היעדרות דרך הקישור האישי שלו
(`/s/:token`). המנהל מקבל מייל מיידי + התראה באפליקציה, התא בטבלה מסומן
"דורש החלפה" (לא נמחק), והדוח החודשי משקף את ימי-המחלה.

## הכרעות אמיר

1. **התראה:** גם באפליקציה (באנר + סימון בטבלה) וגם מייל למנהל/ים.
2. **היקף הדיווח:** כל יום בשבוע המפורסם (לא רק ימים שהעובד משובץ בהם).
3. **טיפול-מנהל:** התא מסומן "דורש החלפה" ולא נמחק אוטומטית - המנהל מחליט.
4. **דוח:** הדוח החודשי מציג **ספירה** של כמה ימי-מחלה דווחו (מספר אינפורמטיבי
   בלבד). המערכת אינה חשבות-שכר - היא לא מנכה ממשמרות ולא מנהלת מכסות; חשבות
   השכר מטפלת בזה בכלים שלה. אנחנו רק מעבירים את המספר. (הכרעת-אמיר 2026-07-19,
   שינוי מהעיצוב המקורי שהציע ניכוי.)

## מודל נתונים

טבלה חדשה `absence_reports` - רשומה אחת פר עובד-יום. **תפעולית** (מזינה את
המייל, הבאנר, הסימון בטבלה, וספירת-הדוח), לא ארכיון-שכר. הרשומות נשארות עד
שהמנהל מסמן "טופל" (מחיקה); הן קטנות ומעטות. אנחנו לא מערכת חשבות-השכר.

| עמודה | טיפוס | הערות |
|---|---|---|
| org_id | TEXT NOT NULL REFERENCES organizations ON DELETE CASCADE | |
| employee_id | TEXT NOT NULL | |
| date | TEXT NOT NULL | YYYY-MM-DD מקומי |
| reported_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| PRIMARY KEY (org_id, employee_id, date) | | דיווח חוזר idempotent |

RLS: policy יחיד לחברי הארגון (`org_id = get_my_org_id()`), FOR ALL - אותו דפוס
כמו `employee_availability`. GRANT ל-authenticated + service_role.

## שכבת DB - `supabase_absence.sql`

קובץ SQL חדש בשורש (מקור-אמת), מוחל דרך Supabase MCP. כל הפונקציות
`SECURITY DEFINER SET search_path = public`.

### RPC ציבורי `submit_absence_report(share_token TEXT, week_dates JSONB, sick_dates JSONB) RETURNS VOID`

EXECUTE ל-anon+authenticated. גוזר org_id+employee_id מ-`share_tokens` (כמו
`submit_employee_availability`). מבצע **החלפה מלאה של פרוסת-השבוע** (בדיוק כמו
דפוס הזמינות): מוחק את רשומות ההיעדרות של העובד שתאריכן ב-`week_dates` אך אינו
ב-`sick_dates` (ביטול-סימון של העובד מכובד), ומכניס את `sick_dates` (upsert,
דיווח חוזר idempotent). דיווחים לשבועות אחרים לא מושפעים. `week_dates` (כל ימי
השבוע המפורסם) נשלח מהלקוח - הוא מכיר אותם מ-`get_share_absence_context`.
token לא קיים - לא עושה דבר.

### RPC ציבורי `get_share_absence_context(share_token TEXT) RETURNS JSONB`

STABLE, EXECUTE ל-anon+authenticated. מחזיר לעובד את השבוע המפורסם + הימים שכבר
דיווח עליהם, כדי שהטופס ייטען מוכן:

```json
{ "weekStart": "...", "activeDays": [...], "currentSickDates": ["2026-07-23"] }
```

מקור ה-weekStart כאן הוא **`published_schedules`** של הארגון (השבוע שהעובד רואה
מולו), לא `app_store.weekStart` (שבוע-התכנון של המנהל, שעשוי להיות קדימה).
token לא קיים / אין פרסום - NULL. שער Pro רדום (כמו הזמינות).

### webhook + Edge Function `notify-absence`

Database Webhook על INSERT ל-`absence_reports` מפעיל `notify-absence`
(דפוס `notify-new-user`). ה-Function:
1. שולפת את שמות+מיילי המנהלים מ-`profiles WHERE org_id = record.org_id`
   (כל המנהלים - אחרי פיצ'ר #3).
2. שולפת את שם העובד מ-`app_store` (key `employees`, לפי employee_id).
3. שולחת מייל לכל מנהל: "העובד X דיווח על היעדרות ליום D (DD.MM)".
4. escaping מלא ל-HTML (כמו הקיים).

⚠️ **deliverability (לרשום ב-spec ובהכרעות-הפעלה):** ה-Function הקיים שולח מ-
`onboarding@resend.dev` (דומיין-בדיקה של Resend). בחשבון חינמי זה מגיע אמין רק
למייל בעל-החשבון (benqueman@gmail.com - אמיר). לשליחה למנהלים בארגונים אחרים
צריך דומיין מאומת ב-Resend - פעולה ידנית עתידית, לא חוסמת את שאר הפיצ'ר.
כשל שליחה לא מפיל את ה-INSERT (ה-webhook א-סינכרוני).

## Frontend - צד העובד

### `src/components/AbsenceForm.tsx` (בעמוד השיתוף)

בדומה ל-`AvailabilityForm`, סעיף חדש ב-`SharePage` מתחת ל"המשמרות שלי":
- כותרת "דיווח היעדרות / מחלה".
- טוען `get_share_absence_context`; אם אין פרסום / Pro כבוי - לא מרונדר.
- רשימת ימי השבוע המפורסם (checkbox פר יום), טעון מ-currentSickDates.
- כפתור "שלח דיווח" - קורא `submit_absence_report`. הודעת אישור/שגיאה כמו
  ב-AvailabilityForm (כולל `.then(onFulfilled, onRejected)` לכשל-רשת).
- לוגיקה טהורה חדשה ב-`src/lib/absence.ts` אם נדרש (טיפוס ה-context) + בדיקות.

## Frontend - צד המנהל (`src/pages/Index.tsx`)

- **טעינה + realtime:** קריאת `absence_reports` של הארגון ל-state (בדומה
  ל-`applyAvailabilitySubmissions`, אבל **לא נמחק** - נטען ונשמר).
- **באנר בולט** מעל הטבלה כשיש דיווחים לשבוע המוצג: "דנה דיווחה על מחלה ליום
  שלישי (23.07)" - עם כפתור "טופל" שמוחק את הרשומה.
- **סימון בטבלה (`ScheduleTable.tsx`):** תא שבו עובד משובץ ביום שדיווח עליו
  מחלה - סימון **אדום** + `title` "חולה - דורש החלפה". חזק יותר מנקודת-הענבר
  של ההעדפה הרכה (רקע אדום עדין / אייקון, לבחירה במימוש).

## הדוח החודשי (`MonthlyReport.tsx`)

**ספירה בלבד - בלי ניכוי, בלי לוגיקת-שכר.**

- prop חדש: מיפוי היעדרויות (שם-עובד + dateISO) - נבנה ב-Index מ-`absence_reports`
  + מיפוי employee_id-לשם מ-`employees`.
- לכל עובד: `sickDays` = מספר ימי-המחלה שדווחו ותאריכם בחודש/שנה של הדוח
  (ספירת רשומות `absence_reports`, בלי הצלבה מול השיבוץ). `totalShifts` **נשאר
  כמו שהוא** - לא מנוכה.
- UI: תג/עמודת "ימי מחלה שדווחו: N" לצד "משמרות". ייצוא Excel כולל את העמודה.
- הצלבה לפי שם-עובד (עקבי עם מוסכמת-השם) + סינון החודש/שנה כמו `buildReport`.

## בדיקות

- vitest: לוגיקת סנכרון-דיווח (הוספה/הסרה לשבוע), ספירת ימי-מחלה בדוח (עובד עם
  2 דיווחים בחודש = sickDays 2, totalShifts לא משתנה), עובד בלי מחלות (רגרסיה).
- בדיקת-עשן SQL אחרי החלה (MCP): submit/get context/ניכוי, ניקוי.
- אימות חי בפרודקשן: דיווח מהקישור, מייל מגיע (לאמיר), באנר+סימון-אדום, דוח מנכה.

## תיעוד

עדכון `public/user-guide.md` (סעיף חדש: דיווח היעדרות - צד עובד וצד מנהל) + PDF.

## מחוץ לתחום (YAGNI)

- אישור-מחלה כקובץ מצורף · מכסות/צבירת ימי-מחלה · דיווח לתאריכים מחוץ לשבוע
  המפורסם · מחיקה-אוטומטית של העובד מהתא · תזכורות/אסקלציה.
