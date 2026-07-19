-- ════════════════════════════════════════════════════════
-- Absence Reports - דיווח היעדרות/מחלה (spec: 2026-07-19)
-- מקור-אמת. מוחל על ה-DB דרך Supabase MCP (apply_migration), לא ידנית.
-- דורש: organizations, share_tokens, published_schedules, app_store,
-- get_my_org_id() (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

-- דיווחי היעדרויות - רשומה פר עובד-יום. תפעולי: מזין מייל/באנר/סימון/ספירה.
-- כשהמנהל מסמן "טופל" השורה לא נמחקת אלא מסומנת (resolved_at) - כדי שהדוח החודשי
-- יוכל לספור את כל מה שדווח באותו חודש, כולל דיווחים שכבר טופלו.
-- מחיקה אמיתית קורית רק כשהעובד מבטל סימון (הימי-מחלה מעולם לא היה אמיתי). לא ארכיון-שכר.
CREATE TABLE IF NOT EXISTS absence_reports (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  date        TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (org_id, employee_id, date)
);

ALTER TABLE absence_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

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
       WHERE a.org_id = t.org_id AND a.employee_id = t.employee_id
         AND a.date >= (p.payload ->> 'weekStart')
         AND a.date <= to_char(((p.payload ->> 'weekStart')::date + 6), 'YYYY-MM-DD')),
      '[]'::jsonb)
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_share_absence_context(TEXT) TO anon, authenticated;

-- הדלת הציבורית השנייה: העובד שולח/מעדכן דיווחי-מחלה לשבוע המפורסם.
-- החלפה מלאה של פרוסת-השבוע (כמו הזמינות): מוחק ימים שהוסרו, מכניס את sick_dates
-- (idempotent). דיווחים לשבועות אחרים לא נוגעים. ימי השבוע נגזרים בשרת (לא מהלקוח) -
-- קריאת-anon לא יכולה להרחיב את הטווח ולהפעיל מבול הכנסות/מיילים.
CREATE OR REPLACE FUNCTION submit_absence_report(share_token TEXT, sick_dates JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_org  TEXT;
  t_emp  TEXT;
  v_week TEXT[];
BEGIN
  SELECT org_id, employee_id INTO t_org, t_emp
  FROM share_tokens WHERE token = share_token;
  IF t_org IS NULL THEN RETURN; END IF;

  -- ימי השבוע המפורסם נגזרים בשרת מ-published_schedules - הלקוח לא יכול להרחיב
  -- את הטווח, ולכן מספר ההכנסות (וההתראות) חסום במספר ימי-העבודה בשבוע.
  SELECT ARRAY(
    SELECT to_char((p.payload ->> 'weekStart')::date + d.value::int, 'YYYY-MM-DD')
    FROM published_schedules p
    CROSS JOIN LATERAL jsonb_array_elements_text(p.payload -> 'activeDays') AS d(value)
    WHERE p.org_id = t_org
  ) INTO v_week;
  IF array_length(v_week, 1) IS NULL THEN RETURN; END IF;

  DELETE FROM absence_reports
   WHERE org_id = t_org AND employee_id = t_emp
     AND date = ANY(v_week)
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(sick_dates) AS s(d)
       WHERE s.d = absence_reports.date
     );

  INSERT INTO absence_reports (org_id, employee_id, date)
  SELECT t_org, t_emp, s.d
  FROM jsonb_array_elements_text(sick_dates) AS s(d)
  WHERE s.d IS NOT NULL AND s.d = ANY(v_week)
  ON CONFLICT (org_id, employee_id, date) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_absence_report(TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS submit_absence_report(TEXT, JSONB, JSONB);
GRANT EXECUTE ON FUNCTION submit_absence_report(TEXT, JSONB) TO anon, authenticated;
