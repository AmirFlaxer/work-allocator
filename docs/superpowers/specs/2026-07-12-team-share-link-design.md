# קישור צפייה לצוות - עיצוב

**תאריך**: 2026-07-12 · **סטטוס**: מאושר על ידי אמיר · **חינם/Pro**: הצפייה חינם לתמיד; הזנת זמינות עתידית על גבי אותה תשתית = Pro (ראו [[2026-07-11-freemium-design]]).

## מטרה

היום השיבוץ מופץ לצוות ידנית (PNG בוואטסאפ). הפיצ'ר נותן לכל עובד קישור אישי קבוע שמציג את השיבוץ שפורסם - טבלה מלאה לקריאה בלבד עם הדגשת המשמרות שלו - בלי חשבון ובלי התחברות.

## הכרעות מוצר (אמיר, 2026-07-12)

1. **תכולת הצפייה**: הטבלה המלאה של הצוות + הדגשה אישית של משמרות הצופה.
2. **פרסום מפורש**: העובדים רואים snapshot שהמנהל פרסם בכפתור "פרסם לצוות", לא את שיבוץ העבודה החי. פרסום חוזר דורס את הקודם - גרסה מפורסמת אחת בכל רגע.
3. **מודל גישה**: קישור אישי קבוע לכל עובד (לא קישור ארגוני משותף ולא חד-פעמי-פר-מכשיר). מזהה את העובד, ניתן לביטול נקודתי, שורד החלפת מכשיר, ומהווה תשתית זהות ל-Pro.
4. **חינם**: הצפייה היא מנוע אימוץ (כל עובד שפותח את הקישור נחשף לאפליקציה) - לא ננעלת לעולם.

## מסד נתונים - `supabase_share.sql`

קובץ SQL עצמאי חדש (לא נוגעים ב-`supabase_migration.sql` שכבר רץ בפרודקשן). דורש את `organizations` ו-`get_my_org_id()` מהמיגרציה הראשית.

```sql
-- snapshot מפורסם - שורה אחת לארגון
CREATE TABLE IF NOT EXISTS published_schedules (
  org_id       TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- קישור אישי לכל עובד
CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,          -- crypto.randomUUID() מהלקוח
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,             -- Employee.id מתוך ה-JSON של הארגון
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, employee_id)
);
```

- RLS על שתי הטבלאות: policy יחיד `FOR ALL USING/WITH CHECK (org_id = get_my_org_id())` + GRANT ל-authenticated. **אין** שום policy ציבורי.
- ביטול קישור = מחיקת השורה. קישור חדש לאותו עובד = מחיקה + הוספה עם token חדש.

**הדרך הציבורית היחידה פנימה** - פונקציה:

```sql
CREATE OR REPLACE FUNCTION get_shared_schedule(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'payload', p.payload,
    'publishedAt', p.published_at,
    'viewerEmployeeId', t.employee_id
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;
GRANT EXECUTE ON FUNCTION get_shared_schedule(TEXT) TO anon, authenticated;
```

token לא קיים או שאין פרסום - מחזירה NULL. אין דרך למנות ארגונים או לקרוא בלי token תקף.

## מבנה ה-payload

נבנה בצד המנהל בעת פרסום:

```ts
interface PublishedPayload {
  weekStart: string;            // ISO
  activeDays: number[];
  stations: { id: number; name: string; requiredCount?: number }[];
  schedule: WeeklySchedule;     // התאים עם שמות העובדים
  employees: { id: string; name: string }[];  // מיפוי id-שם להדגשה
}
```

השיבוץ שומר שמות (המבנה הקיים); ההדגשה נעשית על ידי תרגום `viewerEmployeeId` לשם דרך `employees` שב-payload. שינוי שם עובד לא שובר קישורים - הזיהוי לפי id, והשם מתעדכן בפרסום הבא.

## צד המנהל (Index.tsx + רכיב דיאלוג חדש)

1. **כפתור "פרסם לצוות"** בשורת הפעולות של לשונית השיבוץ (מוצג רק כשיש שיבוץ ו-Supabase מוגדר). לחיצה: בניית payload, upsert ל-`published_schedules`, toast הצלחה.
2. **חיווי מצב**: "פורסם: <זמן יחסי>" ו-badge "יש שינויים שטרם פורסמו" כאשר ה-schedule הנוכחי שונה מה-payload שפורסם (השוואת JSON.stringify של schedule+weekStart). מצב הפרסום נטען בשליפה נפרדת מ-`published_schedules` (select לפי org_id) פעם אחת אחרי טעינת הפרופיל.
3. **דיאלוג "שיתוף לצוות"** (רכיב חדש `ShareLinksDialog.tsx`): רשימת העובדים; לכל עובד "העתק קישור" (יוצר token בהעתקה הראשונה - `crypto.randomUUID()`, insert לטבלה, העתקה ל-clipboard של `https://<origin>/s/<token>`) ו"בטל קישור" (מחיקת השורה, עם אישור). מצב הקישורים נשלף בפתיחת הדיאלוג.
4. **מחיקת עובד** מוחקת גם את ה-token שלו (מצטרף לניקוי המשורשר הקיים ב-`handleDeleteEmployee`).

## צד העובד - עמוד `/s/:token`

- Route ציבורי ב-App.tsx, **לפני** שער ההתחברות (נטען גם בלי user). רכיב חדש `SharePage.tsx`.
- טעינה: `supabase.rpc("get_shared_schedule", { share_token })`. אין supabase מוגדר או תוצאה NULL - מסך "הקישור בוטל או לא קיים - בקשו קישור חדש מהמנהל".
- תצוגה: כותרת עם לוגו ושם השבוע, פס "המשמרות שלי השבוע: יום - עמדה, ..." (או "אין לך משמרות השבוע"), טבלת השיבוץ המלאה לקריאה בלבד בצבעי העובדים הקיימים (`getEmployeeColor`), תאי הצופה מודגשים (ring + הדגשת שם), כיתוב "עודכן: <זמן>".
- רכיב טבלה רזה חדש (לא `ScheduleTable` העמוס בעריכה): שורות עמדות, עמודות ימים, RTL, גלילה אופקית במובייל, תמיכה במצב כהה.
- רענון = טעינת העמוד מחדש (אין realtime בשלב זה).

## טיפול בשגיאות

- rpc נכשל/NULL: מסך "קישור לא תקף" ידידותי (לא מסך שגיאה טכני).
- פרסום נכשל (רשת): toast שגיאה, המצב המקומי לא משתנה.
- העתקת קישור: fallback אם clipboard API לא זמין (הצגת הקישור לסימון ידני).

## בדיקות (vitest)

- בניית payload מ-state נתון (עמדות, שיבוץ, עובדים).
- לוגיקת "יש שינויים שטרם פורסמו" (זהה/שונה).
- חילוץ "המשמרות שלי" מ-payload לפי viewerEmployeeId (כולל עובד בלי משמרות ועובד שנמחק מהרשימה).

## מחוץ לתכולה (בכוונה)

Realtime בעמוד הצופה · התראות/דחיפות · היסטוריית פרסומים · הזנת זמינות על ידי העובד (שלב Pro הבא - ישתמש באותם share_tokens) · הגבלת קצב ב-RPC (ברירת המחדל של Supabase מספיקה בשלב זה).

## צ'קליסט הפעלה

1. להריץ את `supabase_share.sql` ב-SQL Editor (פעולה ידנית של אמיר, כמו הקבצים הקודמים).
2. לפרוס את האפליקציה.
3. לעדכן את מדריכי המשתמש (md + PDF) עם "פרסם לצוות" ו"שיתוף לצוות".
