-- ════════════════════════════════════════════════════════
-- Super-admin — הרשאות קריאה גלובליות לעמוד /admin (נרשמים)
-- להריץ ב-Supabase → SQL Editor, בנפרד מהמיגרציה הראשית
-- (supabase_migration.sql כבר רץ בפרודקשן ומכיל DROP TABLE - לא להריץ שוב!)
--
-- בלי זה, RLS מגביל את הסופר-אדמין לארגון שלו בלבד ועמוד הנרשמים
-- מציג רק את חברי הארגון שלו במקום את כל הנרשמים.
-- כתובת האדמין חייבת להיות זהה גם ב-VITE_SUPER_ADMIN_EMAILS (Vercel).
-- ════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profile_read_superadmin" ON profiles;
CREATE POLICY "profile_read_superadmin" ON profiles FOR SELECT
  USING (auth.jwt()->>'email' = 'benqueman@gmail.com');

DROP POLICY IF EXISTS "org_read_superadmin" ON organizations;
CREATE POLICY "org_read_superadmin" ON organizations FOR SELECT
  USING (auth.jwt()->>'email' = 'benqueman@gmail.com');
