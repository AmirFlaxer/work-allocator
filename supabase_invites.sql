-- ════════════════════════════════════════════════════════
-- Org Invites - מנהל נוסף בארגון (spec: 2026-07-18)
-- מקור-אמת. מוחל על ה-DB דרך Supabase MCP (apply_migration), לא ידנית.
-- דורש: organizations, profiles, get_my_org_id() (supabase_migration.sql).
-- ════════════════════════════════════════════════════════

-- הזמנה חד-פעמית להצטרפות כמנהל. שמומשה - נשארת כתיעוד; ביטול = DELETE.
CREATE TABLE IF NOT EXISTS org_invites (
  token      TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_by    UUID,
  used_at    TIMESTAMPTZ
);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_all" ON org_invites;
CREATE POLICY "invites_all" ON org_invites FOR ALL
  USING     (org_id = get_my_org_id())
  WITH CHECK(org_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON org_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_invites TO service_role;

-- הדלת הציבורית: עמוד ההצטרפות מציג "הוזמנת לנהל את X". token לא קיים - NULL.
CREATE OR REPLACE FUNCTION get_invite_context(invite_token TEXT)
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'orgName',     (SELECT name FROM organizations WHERE id = i.org_id),
    'inviterName', (SELECT full_name FROM profiles WHERE id = i.created_by),
    'status', CASE
      WHEN i.used_by IS NOT NULL THEN 'used'
      WHEN i.expires_at <= NOW()  THEN 'expired'
      ELSE 'valid'
    END
  )
  FROM org_invites i
  WHERE i.token = invite_token;
$$;

GRANT EXECUTE ON FUNCTION get_invite_context(TEXT) TO anon, authenticated;

-- מימוש הזמנה: אטומי (FOR UPDATE מונע מימוש כפול במקביל). שגיאות כערך, לא exception.
CREATE OR REPLACE FUNCTION accept_org_invite(invite_token TEXT, full_name TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv        org_invites%ROWTYPE;
  user_email TEXT;
BEGIN
  SELECT * INTO inv FROM org_invites WHERE token = invite_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF inv.used_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used');
  END IF;
  IF inv.expires_at <= NOW() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member');
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  -- מרוץ נדיר: אותו משתמש מממש שני tokens שונים בשני טאבים במקביל - שניהם עוברים
  -- את בדיקת ה-EXISTS לפני ששניהם נכתבו; השני ייתקל בהפרת PK ויקבל ערך ידידותי.
  BEGIN
    INSERT INTO profiles (id, org_id, role, full_name, email)
    VALUES (auth.uid(), inv.org_id, 'admin', accept_org_invite.full_name, user_email);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member');
  END;

  UPDATE org_invites SET used_by = auth.uid(), used_at = NOW()
  WHERE token = invite_token;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ברירת-המחדל של Postgres נותנת EXECUTE ל-PUBLIC - מצמצמים למאומתים בלבד.
REVOKE EXECUTE ON FUNCTION accept_org_invite(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION accept_org_invite(TEXT, TEXT) TO authenticated;

-- הסרת מנהל אחר מהארגון. אין הסרה-עצמית - כך תמיד נשאר לפחות מנהל אחד.
CREATE OR REPLACE FUNCTION remove_org_member(target_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_org     TEXT;
  target_org TEXT;
BEGIN
  SELECT org_id INTO my_org FROM profiles WHERE id = auth.uid();
  IF my_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;
  IF target_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;
  SELECT org_id INTO target_org FROM profiles WHERE id = target_id;
  IF target_org IS NULL OR target_org <> my_org THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  DELETE FROM profiles WHERE id = target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_org_member(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION remove_org_member(UUID) TO authenticated;

-- ── הידוק אגבי: INSERT ישיר של profile מותר רק לארגון ריק (זרם הרשמה רגיל) ──
-- subquery ישיר ב-policy כפוף בעצמו ל-RLS (ולכן תמיד ריק למשתמש חדש) -
-- לכן פונקציית-עזר SECURITY DEFINER, בדפוס get_my_org_id.
CREATE OR REPLACE FUNCTION org_has_members(check_org_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE org_id = check_org_id); $$;

REVOKE EXECUTE ON FUNCTION org_has_members(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION org_has_members(TEXT) TO authenticated;

DROP POLICY IF EXISTS "profile_create" ON profiles;
CREATE POLICY "profile_create" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND NOT org_has_members(org_id));
