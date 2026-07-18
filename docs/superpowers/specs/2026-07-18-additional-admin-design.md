# מנהל נוסף בארגון - עיצוב (בקלוג #3)

**תאריך:** 2026-07-18
**סטטוס:** מאושר ע"י אמיר (עיצוב הוצג ואושר בצ'אט)

## מהות

היום כל הרשמה יוצרת ארגון חדש. הפיצ'ר מוסיף זרם הזמנה: מנהל קיים יוצר קישור-הזמנה
חד-פעמי ושולח בעצמו (וואטסאפ/מייל). הנמען פותח את הקישור, נרשם (מייל+סיסמה+שם מלא -
בלי שם ארגון), ומצטרף כמנהל **שווה-מעמד מלא** לארגון הקיים.

## הכרעות אמיר

1. **הרשאות:** המנהל הנוסף שווה-מעמד מלא - עובדים, עמדות, שיבוץ, פרסום, והזמנת מנהלים
   נוספים. אין מערכת תפקידים מדורגת.
2. **ניהול צוות:** רשימת מנהלים + הסרת מנהל + ביטול הזמנה שטרם מומשה.
3. **מנגנון:** קישור הזמנה שהמנהל משתף בעצמו (לא מייל אוטומטי, לא קוד קצר).

## שכבת DB - `supabase_invites.sql`

קובץ SQL חדש בשורש הריפו (מקור-אמת), מוחל על ה-DB דרך ה-Supabase MCP (כמו
`supabase_availability.sql` ב-2026-07-18). כל הפונקציות עם
`SECURITY DEFINER SET search_path = public`.

### טבלת `org_invites`

| עמודה | טיפוס | הערות |
|---|---|---|
| token | TEXT PK | UUID, נוצר בצד הלקוח (`crypto.randomUUID()`) |
| org_id | TEXT NOT NULL REFERENCES organizations ON DELETE CASCADE | |
| created_by | UUID NOT NULL | ה-auth.uid() של המזמין |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| expires_at | TIMESTAMPTZ NOT NULL | NOW() + 7 ימים |
| used_by | UUID NULL | מי מימש |
| used_at | TIMESTAMPTZ NULL | מתי מומש |

RLS: policy יחיד לחברי הארגון (`org_id = get_my_org_id()`), FOR ALL - אותו דפוס כמו
`share_tokens`. GRANT ל-authenticated + service_role. **אין** גישה ציבורית ישירה לטבלה.
הזמנה שמומשה נשארת בטבלה כתיעוד אך **מוסתרת ב-UI** (רשימת "הזמנות ממתינות" מציגה
רק לא-מומשות ולא-פגות); ביטול הזמנה = DELETE של השורה ע"י מנהל.

### RPC ציבורי `get_invite_context(invite_token TEXT) RETURNS JSONB`

STABLE, EXECUTE ל-anon+authenticated. עבור token קיים מחזיר:

```json
{ "orgName": "...", "inviterName": "...", "status": "valid" | "expired" | "used" }
```

token לא קיים - NULL. עמוד ההצטרפות משתמש בזה להצגת "הוזמנת לנהל את ארגון X"
או הודעת שגיאה מתאימה. לא דולף שום מידע מעבר לשם הארגון והמזמין (ומי שמחזיק
token ממילא הוזמן).

### RPC `accept_org_invite(invite_token TEXT, full_name TEXT) RETURNS JSONB`

EXECUTE ל-authenticated בלבד (לא anon). מבצע אטומית:

1. נועל את שורת ההזמנה (`SELECT ... FOR UPDATE`) - מונע מימוש כפול במקביל.
2. בדיקות: token קיים · לא פג (`expires_at > NOW()`) · לא מומש (`used_by IS NULL`) ·
   למשתמש (`auth.uid()`) אין עדיין profile.
3. יוצר profile: `id=auth.uid(), org_id=של ההזמנה, role='admin', full_name=פרמטר,
   email=מ-auth.users`.
4. מסמן את ההזמנה: `used_by=auth.uid(), used_at=NOW()`.

מחזיר `{"ok": true}` או `{"ok": false, "reason": "expired"|"used"|"not_found"|"already_member"}` -
שגיאות מוחזרות כערך ולא כ-exception כדי שהלקוח יציג הודעה ידידותית. LANGUAGE plpgsql
(נדרש לנעילה ולוגיקה מותנית - בשונה מפונקציות ה-SQL הקיימות).

### RPC `remove_org_member(target_id UUID) RETURNS JSONB`

EXECUTE ל-authenticated. בדיקות: למבצע יש profile · target באותו ארגון ·
`target_id <> auth.uid()` (אין הסרה-עצמית - מבטיח שתמיד נשאר לפחות מנהל אחד).
מוחק את ה-profile של ה-target. המשתמש המוסר נשאר ב-auth.users בלי profile -
בכניסה הבאה ייכנס לזרם `profileMissing` הקיים ויוכל להקים ארגון חדש (התנהגות מכוונת).

### הידוק אבטחה אגבי - policy `profile_create`

ה-policy הקיים (`WITH CHECK (id = auth.uid())`) מאפשר תיאורטית INSERT ישיר של profile
לכל org_id (מוגן היום רק בכך ש-org_id הוא UUID לא-ניתן-לניחוש). יוקשח כך ש-INSERT
ישיר מותר רק לארגון ריק (= זרם ההרשמה הרגיל שיוצר ארגון חדש ומיד profile).

**חשוב:** אי-אפשר לכתוב את הבדיקה כ-subquery ישיר על `profiles` בתוך ה-policy -
ה-subquery כפוף בעצמו ל-RLS (עבור משתמש חדש `get_my_org_id()` היא NULL, ה-subquery
יחזיר תמיד ריק והבדיקה תעבור גם לארגון מאוכלס). לכן פונקציית-עזר בדפוס של
`get_my_org_id`:

```sql
CREATE FUNCTION org_has_members(check_org_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE org_id = check_org_id); $$;

-- profile_create:
WITH CHECK (id = auth.uid() AND NOT org_has_members(org_id))
```

הצטרפות לארגון מאוכלס אפשרית **רק** דרך `accept_org_invite` (שהוא SECURITY DEFINER
ועוקף RLS). זרם ההרשמה הקיים לא נפגע.

## Frontend

### route חדש `/join/:token` - `JoinPage.tsx`

- טוען `get_invite_context`. לפי המצב:
  - **valid + לא מחובר:** "הוזמנת לנהל את ארגון X (ע"י Y)" + טופס: שם מלא, מייל,
    סיסמה, כפתור "הצטרפות". עיצוב באותה שפה כמו `LoginPage`/`SharePage`.
  - **valid + מחובר עם profile:** הודעה שהחשבון כבר שייך לארגון, אין ריבוי-ארגונים;
    קישור חזרה לאפליקציה.
  - **valid + מחובר בלי profile** (הרשמה שנקטעה): מציג את הטופס עם שם מלא בלבד
    (המשתמש כבר מאומת) - `accept_org_invite` ישירות.
  - **expired / used / NULL:** הודעה מתאימה ("פג תוקף - בקשו קישור חדש" / "הקישור
    כבר מומש" / "קישור לא תקין").
- שגיאת `accept_org_invite` (למשל מומש בין הטעינה לשליחה) מוצגת בטופס, לא נבלעת.

### `AuthContext` - פונקציה חדשה `signUpAndJoin`

`signUpAndJoin(email, password, fullName, token)`: `auth.signUp` ואז
`rpc('accept_org_invite')` ואז `loadProfile`. בלי יצירת ארגון. כשל ב-accept אחרי
signup מוצלח משאיר משתמש מאומת בלי profile - זרם `profileMissing` הקיים כבר
מטפל בזה (רשת ביטחון קיימת).

### דיאלוג "ניהול מנהלים" - `TeamDialog.tsx`

נפתח מכפתור בסרגל העליון (ליד "עזרה", באותו סגנון). שלושה אזורים:

1. **מנהלי הארגון:** רשימת profiles של הארגון (שם, מייל, תאריך הצטרפות; "אני" מסומן).
   כפתור הסרה ליד כל מנהל אחר (לא ליד עצמך), עם דיאלוג אישור. קורא `remove_org_member`.
2. **הזמנות ממתינות:** שורות `org_invites` שלא מומשו ולא פגו - קישור להעתקה
   (`{origin}/join/{token}`) + תוקף + כפתור ביטול (DELETE).
3. **כפתור "הזמנת מנהל":** יוצר שורה (token=`crypto.randomUUID()`,
   expires_at=+7 ימים), מציג את הקישור להעתקה מיידית.

הטעינה בפתיחת הדיאלוג (אין צורך ב-realtime - נתון קטן ונדיר-שינוי).

### שער Pro רדום - `plan.ts`

`canUseAdditionalAdmins(): boolean` באותו דפוס כמו `canUseAvailabilityInput` -
כל עוד `ENFORCE_QUOTA=false` פתוח לכולם. נקודת אכיפה עתידית: כפתור "הזמנת מנהל"
(מנהלים שכבר הצטרפו לא ננעלים - עקרון "לא נועלים נתונים קיימים" מה-freemium spec).

## בדיקות

- **vitest:** לוגיקה טהורה חדשה - בניית URL הזמנה, סיווג מצב הזמנה (valid/expired/used)
  מתשובת ה-RPC, ולידציית טופס ההצטרפות. בקבצי `*.test.ts` לצד הקוד, כמקובל.
- **בדיקת-עשן SQL אחרי החלה** (דרך MCP): יצירת הזמנה, get_invite_context, מימוש עם
  משתמש בדיקה או סימולציה, ניסיון מימוש כפול (נכשל), ניקוי.
- **אימות ידני בפרודקשן:** יצירת קישור מהחשבון של אמיר, הצטרפות בחלון גלישה בסתר.

## תיעוד

עדכון `public/user-guide.md` (פרק חדש קצר: הזמנת מנהל נוסף) + יצירת PDF מחדש
(חובת-תחזוקה - memory `project_user_guides`).

## מחוץ לתחום (YAGNI)

- ריבוי-ארגונים למשתמש אחד / החלפת ארגון.
- תפקידים מדורגים (owner/viewer) - עמודת `role` נשארת 'admin' לכולם.
- שליחת מייל אוטומטית (אפשר להוסיף בעתיד מעל אותו קישור).
- העברת בעלות / מחיקת ארגון.
