-- ============================================================================
-- הסרת מדיניות-INSERT ישנה שמנטרלת בשקט את המעקים המוקשחים
-- (2026-07-26, לפני העלאת ארגוני-פיילוט אמיתיים)
-- ============================================================================
--
-- הבעיה: לכל טבלה נשארו שתי מדיניות PERMISSIVE ל-INSERT - הישנה והמוקשחת.
-- Postgres מחבר מדיניות PERMISSIVE ב-OR, ולכן **החלשה מנצחת** והמעקה החדש
-- מעולם לא נאכף:
--
--   profiles INSERT
--     "Users can insert own profile"  ->  (auth.uid() = id)                     <-- ישנה
--     "profile_create"                ->  (id = auth.uid() AND NOT org_has_members(org_id))
--
--   organizations INSERT
--     "Authenticated users can create organizations" -> (auth.uid() IS NOT NULL) <-- ישנה
--     "org_create" -> (auth.uid() IS NOT NULL AND NOT EXISTS(profile של המשתמש))
--
-- ההשלכה, שאומתה בפועל מול הפרודקשן בטרנזקציה שגולגלה לאחור: משתמש שנרשם
-- (auth.signUp הצליח) אך לא השלים יצירת ארגון, יכול להכניס לעצמו profile עם
-- org_id **של ארגון אחר** ולקבל גישת-admin לכל נתוניו - כי get_my_org_id()
-- קורא בדיוק מהטבלה הזו. נדרשת ידיעת ה-UUID של הארגון, ולכן זו לא פרצה
-- טריוויאלית לניצול - אבל היא מבטלת לגמרי את בידוד-הדיירים שהמעקה נועד לתת,
-- וזה בדיוק מה שחייב להיות תקין לפני שיש יותר מארגון אחד במערכת.
--
-- למה בטוח להסיר: זרם ההרשמה התקין ממשיך לעבור - org_has_members() על ארגון
-- חדש מחזיר false ולמשתמש טרי אין profile. הצטרפות-מוזמן אינה עוברת כאן כלל
-- אלא דרך accept_org_invite(), שהיא SECURITY DEFINER ועוקפת RLS.
-- שתי הטענות אומתו מול הפרודקשן לפני כתיבת הקובץ.

BEGIN;

DROP POLICY IF EXISTS "Users can insert own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

COMMIT;

-- ── אימות אחרי ההרצה ────────────────────────────────────────────────────────
-- אמור להחזיר שורה אחת בלבד לכל טבלה (profile_create / org_create):
--
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND cmd='INSERT'
--     AND tablename IN ('profiles','organizations')
--   ORDER BY tablename;
