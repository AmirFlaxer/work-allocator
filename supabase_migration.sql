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

-- 5. RLS Policies — Organizations
CREATE POLICY "org_read"   ON organizations FOR SELECT
  USING (id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_create" ON organizations FOR INSERT WITH CHECK (true);

-- 6. RLS Policies — Profiles
CREATE POLICY "profile_read"   ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profile_create" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- 7. RLS Policies — App Store (org isolation)
CREATE POLICY "store_all" ON app_store FOR ALL
  USING     (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK(org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- 8. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE app_store;

-- ════════════════════════════════════════════════════════
-- IMPORTANT: In Supabase → Authentication → Settings:
--   Disable "Enable email confirmations" for easier dev/testing
-- ════════════════════════════════════════════════════════
