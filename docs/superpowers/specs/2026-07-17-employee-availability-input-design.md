# הזנת זמינות ע"י העובדים - עיצוב

**תאריך**: 2026-07-17 · **סטטוס**: מאושר על ידי אמיר · **חינם/Pro**: מפתח Pro דומם (כמו יתר יכולות ה-freemium) - הצפייה בקישור נשארת חינם, הזנת הזמינות מותנית ב-`canUseAvailabilityInput`.

## מטרה

היום המנהל מזין ידנית לכל עובד את הימים שהוא לא זמין (`WeeklyPreferences`). הפיצ'ר מאפשר לעובד להזין בעצמו את הימים שהוא לא זמין בהם, דרך אותו קישור אישי קבוע שכבר יש לו לצפייה בשיבוץ (ראו [[2026-07-12-team-share-link-design]]). ההגשה נכנסת אוטומטית לנתוני הארגון - בלי שהמנהל צריך לאשר בקשה-בקשה.

## הכרעות מוצר (אמיר, 2026-07-17)

1. **תזרים הקבלה**: כתיבה ישירה ומיידית ל-`unavailableDays` של העובד - לא תור בקשות ממתינות לאישור. המנהל תמיד יכול לבטל/לשנות בעריכה רגילה ב-`WeeklyPreferences`, בדיוק כמו כל סימון ידני.
2. **תכולת ההזנה**: רק ימים לא זמינים. לא בקשות שיבוץ לעמדה ספציפית (`specificRequests`) - זה נשאר כלי של המנהל בלבד.
3. **גייטינג**: מפתח Pro דומם (`canUseAvailabilityInput`, `ENFORCE_QUOTA=false`) - אותו דפוס כמו `canUseMonthlyReports` ב-[[2026-07-11-freemium-design]].

## מסד נתונים - `supabase_availability.sql`

קובץ SQL עצמאי חדש (לא נוגעים במיגרציות הקיימות). דורש `organizations`, `share_tokens` ו-`app_store`.

```sql
-- "תיבת דואר נכנס" של הגשות זמינות - שורה אחת פר עובד, שולחים שוב = דורס
CREATE TABLE IF NOT EXISTS employee_availability (
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       TEXT NOT NULL,
  week_start        TEXT NOT NULL,        -- YYYY-MM-DD מקומי
  unavailable_dates JSONB NOT NULL,       -- מערך תאריכי YYYY-MM-DD בתוך אותו שבוע
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, employee_id)
);
```

- RLS: policy יחיד `FOR ALL USING/WITH CHECK (org_id = get_my_org_id())` + GRANT ל-authenticated. אין policy ציבורי - הגישה הציבורית היחידה היא דרך שתי הפונקציות הבאות.
- מחיקת עובד (`handleDeleteEmployee`) מוחקת גם את שורת ה-`employee_availability` שלו, מצטרפת לניקוי המשורשר הקיים (מחיקת `share_tokens`).

### פונקציות SECURITY DEFINER ציבוריות

```sql
CREATE OR REPLACE FUNCTION get_share_availability_context(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'weekStart', (SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'weekStart'),
    'activeDays', (SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'activeDays'),
    'currentUnavailableDays', (
      SELECT COALESCE(
        (SELECT value -> 'unavailableDays'
         FROM jsonb_array_elements((SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'employees')) AS value
         WHERE value ->> 'id' = t.employee_id),
        '[]'::jsonb)
    )
  )
  FROM share_tokens t
  WHERE t.token = share_token;
$$;
GRANT EXECUTE ON FUNCTION get_share_availability_context(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION submit_employee_availability(share_token TEXT, week_start TEXT, unavailable_dates JSONB)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  INSERT INTO employee_availability (org_id, employee_id, week_start, unavailable_dates, updated_at)
  SELECT t.org_id, t.employee_id, week_start, unavailable_dates, NOW()
  FROM share_tokens t WHERE t.token = share_token
  ON CONFLICT (org_id, employee_id)
  DO UPDATE SET week_start = EXCLUDED.week_start,
                unavailable_dates = EXCLUDED.unavailable_dates,
                updated_at = NOW();
$$;
GRANT EXECUTE ON FUNCTION submit_employee_availability(TEXT, TEXT, JSONB) TO anon, authenticated;
```

token לא קיים - שתי הפונקציות לא עושות דבר / מחזירות NULL, בלי שגיאה חושפת מידע.

## צד העובד - הרחבת `/s/:token`

- קריאה נפרדת ל-`get_share_availability_context` ב-`SharePage.tsx`, בנוסף (לא תלוית) לקריאה הקיימת ל-`get_shared_schedule`. כשל/NULL/Supabase לא מוגדר/`canUseAvailabilityInput()` מחזיר `false` - הסקציה פשוט לא מוצגת, שאר העמוד ממשיך לעבוד.
- סקציה חדשה **"הזמינות שלך לשבוע הבא"** מעל טבלת השיבוץ: checkbox פר יום פעיל (סגנון כמו `WeeklyPreferences`), טעונה מראש עם `currentUnavailableDays`.
- כפתור "שלח עדכון" קורא ל-`submit_employee_availability(token, weekStart, selectedDates)`. הצלחה - הודעת אישור מוטמעת בעמוד ("הזמינות עודכנה, תודה!") שנעלמת אחרי כמה שניות (אין toast library בעמוד הציבורי). כשל - הודעת שגיאה מוטמעת, המצב המקומי בטופס נשאר, ניתן לנסות שוב.
- ניתן לשלוח שוב ולערוך - כל שליחה דורסת את הקודמת (`ON CONFLICT` למעלה).

## צד המנהל - מיזוג אוטומטי (Index.tsx)

בתוך ה-`useEffect` הקיים שטוען מ-`app_store` בעליית האפליקציה (אחרי טעינת `employees` ו-`weekStart`):

1. שליפת שורות `employee_availability` עבור `org_id`, מסוננות ל-`week_start === weekStart` הנטען.
2. לכל שורה: ב-`employees` שהוטען, מסירים מ-`unavailableDays` של אותו `employee_id` כל תאריך שבתוך טווח 7 הימים של השבוע, ומוסיפים את `unavailable_dates` שהוגשו (**החלפה מלאה של פרוסת השבוע**, לא union - כך גם ביטול-סימון של העובד מכובד).
3. אם היה מיזוג בפועל: `toast({ title: "הוחלו עדכוני זמינות מ-N עובדים" })`, ואז מחיקת השורות הממוזגות מ-`employee_availability` (מונע מיזוג חוזר שידרוס עריכה ידנית עתידית של המנהל).
4. השמירה חוזרת דרך `syncToSupabase("employees", ...)` הקיים - אין צורך בקוד סנכרון נוסף.

**המיזוג רץ רק בטעינת האפליקציה (mount), לא ב-realtime חי** - תואם את דפוס העבודה הקיים (המנהל פותח את האפליקציה כשהוא בונה שיבוץ), נמנע ממורכבות מיזוג-תוך-כדי-עריכה.

## שער Pro (דומם)

`plan.ts`: `canUseAvailabilityInput()` באותו דפוס כמו `canUseMonthlyReports` - `true` תמיד כש-`ENFORCE_QUOTA=false`, בלי פרמטר `plan` (בניגוד לבדיקות הקיימות שמקבלות `plan` שכבר ידוע להן מ-`profile` המחובר - בעמוד הציבורי `SharePage.tsx` אין `profile`, ואין טעם לשלוף plan של הארגון מה-DB כל עוד המתג הגלובלי כבוי ממילא). מכיוון שהמתג הגלובלי דומם, זו קריאה טהורה בלי תלות ב-DB - כשיופעל בעתיד (`ENFORCE_QUOTA=true`), תידרש תשתית נוספת (שליפת plan הארגון מטבלת `subscriptions` דרך RPC) שמפורשת ב"מחוץ לתכולה".

בצד המנהל אין שער נוסף - `ShareLinksDialog` ממשיך לעבוד כרגיל, הצפייה עצמה חינם לתמיד.

## טיפול בשגיאות

- `get_share_availability_context` נכשל/NULL: הסקציה לא מוצגת, בלי הודעת שגיאה בולטת.
- שליחה נכשלת (רשת): הודעת שגיאה מוטמעת, המצב המקומי לא משתנה, ניתן לנסות שוב.
- מיזוג בצד המנהל שנכשל בשמירה ל-`app_store`: מתנהג כמו כשל sync רגיל (`syncStatus: "error"`); השורות ב-`employee_availability` **לא** נמחקות אלא רק אחרי הצלחה - כך שהניסיון הבא ינסה שוב.

## בדיקות (vitest)

- מיזוג: מחליף תאריכים בתוך טווח השבוע בלבד, לא נוגע בתאריכים מחוץ לשבוע או בעובדים אחרים.
- מיזוג עם עובד שנמחק בינתיים - לא קורס, מתעלם מהשורה.
- חילוץ ה-context (weekStart/activeDays/currentUnavailableDays) מנתוני שרת גולמיים.

## מחוץ לתכולה (בכוונה)

מיזוג realtime תוך כדי שהמנהל פתוח באפליקציה · ציון "מקור" הסימון (עובד מול מנהל) ב-UI · בקשות שיבוץ לעמדה ספציפית (`specificRequests`) · אכיפת Pro בפועל בצד השרת (כרוכה בהפעלת ה-freemium בכללותו - שליפת plan הארגון דרך RPC ציבורי).

## צ'קליסט הפעלה

1. להריץ את `supabase_availability.sql` ב-SQL Editor (פעולה ידנית של אמיר).
2. לפרוס את האפליקציה.
3. לעדכן את מדריכי המשתמש (md + PDF) עם הסבר לעובד על הסקציה החדשה בקישור האישי.
