-- ════════════════════════════════════════════════════════
-- Freemium — טבלת מנויים (תשתית רדומה)
-- להריץ ב-Supabase → SQL Editor, בנפרד מהמיגרציה הראשית
-- (supabase_migration.sql כבר רץ בפרודקשן ומכיל DROP TABLE - לא להריץ שוב!)
-- דורש: organizations + get_my_org_id() מהמיגרציה הראשית.
-- ════════════════════════════════════════════════════════

-- מקור האמת לתוכנית הארגון (free/pro). המנוי על הארגון, לא על המשתמש.
-- כתיבה רק דרך service_role (עדכון ידני / webhook עתידי מספק תשלום);
-- חברי הארגון קוראים בלבד.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       serial      PRIMARY KEY,
  org_id                   TEXT        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan                     TEXT        NOT NULL DEFAULT 'free',
  status                   TEXT        NOT NULL DEFAULT 'active',
  current_period_end       TIMESTAMPTZ,
  trial_end                TIMESTAMPTZ,
  provider                 TEXT,
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_read_org" ON subscriptions;
CREATE POLICY "subscriptions_read_org" ON subscriptions FOR SELECT
  USING (org_id = get_my_org_id());

GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO service_role;
GRANT USAGE ON SEQUENCE subscriptions_id_seq TO service_role;
