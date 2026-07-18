-- ════════════════════════════════════════════════════════
-- Team Share — קישור צפייה אישי לעובדים (spec: 2026-07-12)
-- להריץ ב-Supabase → SQL Editor, בנפרד מהמיגרציה הראשית
-- (supabase_migration.sql כבר רץ בפרודקשן ומכיל DROP TABLE - לא להריץ שוב!)
-- דורש: organizations + get_my_org_id() מהמיגרציה הראשית.
-- ════════════════════════════════════════════════════════

-- snapshot מפורסם - שורה אחת לארגון. פרסום חוזר דורס (upsert).
CREATE TABLE IF NOT EXISTS published_schedules (
  org_id       TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- קישור צפייה אישי - token לכל עובד. ביטול = מחיקת השורה.
CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, employee_id)
);

ALTER TABLE published_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_tokens        ENABLE ROW LEVEL SECURITY;

-- חברי הארגון מנהלים את הנתונים שלהם; אפס גישה ציבורית ישירה.
DROP POLICY IF EXISTS "published_all" ON published_schedules;
CREATE POLICY "published_all" ON published_schedules FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

DROP POLICY IF EXISTS "tokens_all" ON share_tokens;
CREATE POLICY "tokens_all" ON share_tokens FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON published_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON share_tokens        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON published_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON share_tokens        TO service_role;

-- הדלת הציבורית היחידה: token תקף מחזיר את ה-snapshot + זהות הצופה.
-- token לא קיים או שאין פרסום - NULL. אין דרך למנות ארגונים.
CREATE OR REPLACE FUNCTION get_shared_schedule(share_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'payload',          p.payload,
    'publishedAt',      p.published_at,
    'viewerEmployeeId', t.employee_id
  )
  FROM share_tokens t
  JOIN published_schedules p ON p.org_id = t.org_id
  WHERE t.token = share_token;
$$;

GRANT EXECUTE ON FUNCTION get_shared_schedule(TEXT) TO anon, authenticated;
