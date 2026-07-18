-- ════════════════════════════════════════════════════════
-- Work Allocator — Multi-tenant migration
-- Run this in: Supabase → SQL Editor
-- ════════════════════════════════════════════════════════

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Profiles (link users ↔ organizations)
CREATE TABLE IF NOT EXISTS profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id    TEXT NOT NULL REFERENCES organizations(id),
  role      TEXT NOT NULL DEFAULT 'admin',
  full_name TEXT,
  email     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Recreate app_store with org_id
DROP TABLE IF EXISTS app_store;
CREATE TABLE app_store (
  key        TEXT NOT NULL,
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (key, org_id)
);

-- 4. Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_store     ENABLE ROW LEVEL SECURITY;

-- 5. Helper function — עוקפת RLS כדי למנוע infinite recursion.
--    חייבת להיות מוגדרת לפני ה-policies שמשתמשות בה.
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT org_id FROM profiles WHERE id = auth.uid(); $$;

-- 6. RLS Policies — Organizations
CREATE POLICY "org_read"   ON organizations FOR SELECT
  USING (id = get_my_org_id());
-- רק משתמש מאומת שעדיין אין לו ארגון יכול ליצור ארגון חדש (במהלך signup)
CREATE POLICY "org_create" ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

-- 7. RLS Policies — Profiles
-- משתמש רואה את כל חברי הארגון שלו
CREATE POLICY "profile_read" ON profiles FOR SELECT
  USING (org_id = get_my_org_id());
CREATE POLICY "profile_create" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- 8. RLS Policies — App Store (org isolation)
CREATE POLICY "store_all" ON app_store FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

-- 9. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE app_store;

-- ════════════════════════════════════════════════════════
-- IMPORTANT: In Supabase → Authentication → Settings:
--   Disable "Enable email confirmations" for easier dev/testing
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
-- GRANTS — נדרש מ-30 אוקטובר 2026 (Supabase Data API change)
-- טבלאות ב-public חייבות GRANT מפורש כדי להיות נגישות ל-API
-- ────────────────────────────────────────────────────────
GRANT SELECT, INSERT                    ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE    ON public.profiles      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE    ON public.app_store     TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE    ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE    ON public.profiles      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE    ON public.app_store     TO service_role;
