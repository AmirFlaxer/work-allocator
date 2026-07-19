-- ════════════════════════════════════════════════════════
-- Absence Reports - דיווח היעדרות/מחלה (spec: 2026-07-19)
-- מקור-אמת. מוחל על ה-DB דרך Supabase MCP (apply_migration), לא ידנית.
-- דורש: organizations, share_tokens, published_schedules, app_store,
-- get_my_org_id() (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

-- דיווחי היעדרויות - רשומה פר עובד-יום. תפעולי: מזין מייל/באנר/סימון/ספירה.
-- נמחק כשהמנהל מסמן "טופל" או כשהעובד מבטל סימון. לא ארכיון-שכר.
CREATE TABLE IF NOT EXISTS absence_reports (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  date        TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, employee_id, date)
);

ALTER TABLE absence_reports ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "absence_all" ON absence_reports;
CREATE POLICY "absence_all" ON absence_reports FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON absence_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON absence_reports TO service_role;

-- realtime - כדי שהבאנר אצל המנהל יופיע חי בלי רענון
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'absence_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE absence_reports;
  END IF;
END $$;

-- הדלת הציבורית הראשונה: מחזירה לעובד את השבוע המפורסם + הימים שכבר דיווח עליהם.
-- מקור השבוע הוא published_schedules (מה שהעובד רואה מולו), לא app_store.weekStart.
CREATE OR REPLACE FUNCTION get_share_absence_context(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'weekStart',  p.payload -> 'weekStart',
    'activeDays', p.payload -> 'activeDays',
    'currentSickDates', COALESCE(
      (SELECT jsonb_agg(a.date)
       FROM absence_reports a
       WHERE a.org_id = t.org_id AND a.employee_id = t.employee_id),
      '[]'::jsonb)
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_share_absence_context(TEXT) TO anon, authenticated;

-- הדלת הציבורית השנייה: העובד שולח/מעדכן דיווחי-מחלה לשבוע המפורסם.
-- החלפה מלאה של פרוסת-השבוע (כמו הזמינות): מוחק ימים שהוסרו מ-week_dates,
-- מכניס את sick_dates (idempotent). דיווחים לשבועות אחרים לא נוגעים.
CREATE OR REPLACE FUNCTION submit_absence_report(share_token TEXT, week_dates JSONB, sick_dates JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_org TEXT;
  t_emp TEXT;
BEGIN
  SELECT org_id, employee_id INTO t_org, t_emp
  FROM share_tokens WHERE token = share_token;
  IF t_org IS NULL THEN RETURN; END IF;

  DELETE FROM absence_reports
   WHERE org_id = t_org AND employee_id = t_emp
     AND date IN (SELECT jsonb_array_elements_text(week_dates))
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(sick_dates) AS s(d)
       WHERE s.d = absence_reports.date
     );

  INSERT INTO absence_reports (org_id, employee_id, date)
  SELECT t_org, t_emp, s.d
  FROM jsonb_array_elements_text(sick_dates) AS s(d)
  WHERE s.d IS NOT NULL
  ON CONFLICT (org_id, employee_id, date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_absence_report(TEXT, JSONB, JSONB) TO anon, authenticated;
