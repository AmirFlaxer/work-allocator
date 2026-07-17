-- ════════════════════════════════════════════════════════
-- Employee Availability - הזנת זמינות ע"י העובדים (spec: 2026-07-17)
-- להריץ ב-Supabase אל SQL Editor, בנפרד מהמיגרציה הראשית
-- דורש: organizations, get_my_org_id(), share_tokens, app_store (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

-- "תיבת דואר נכנס" של הגשות זמינות - שורה אחת פר עובד. שולחים שוב = דורס.
CREATE TABLE IF NOT EXISTS employee_availability (
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       TEXT NOT NULL,
  week_start        TEXT NOT NULL,
  unavailable_dates JSONB NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, employee_id)
);

ALTER TABLE employee_availability ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "availability_all" ON employee_availability;
CREATE POLICY "availability_all" ON employee_availability FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_availability TO service_role;

-- הדלת הציבורית הראשונה: מחזירה לעובד את השבוע הפתוח + הזמינות הנוכחית שלו,
-- כדי שהטופס בעמוד השיתוף ייטען מוכן. token לא קיים - NULL.
CREATE OR REPLACE FUNCTION get_share_availability_context(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'weekStart', (SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'weekStart'),
    'activeDays', COALESCE((SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'activeDays'), '[0,1,2,3,4]'::jsonb),
    'currentUnavailableDays', (
      SELECT COALESCE(
        (SELECT emp -> 'unavailableDays'
         FROM jsonb_array_elements((SELECT value FROM app_store WHERE org_id = t.org_id AND key = 'employees')) AS emp
         WHERE emp ->> 'id' = t.employee_id),
        '[]'::jsonb)
    )
  )
  FROM share_tokens t
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_share_availability_context(TEXT) TO anon, authenticated;

-- הדלת הציבורית השנייה: העובד שולח/מעדכן את הזמינות שלו לשבוע הנתון.
-- upsert - שליחה חוזרת דורסת את הקודמת. token לא קיים - לא עושה דבר.
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
