# מנהל נוסף בארגון - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מנהל קיים יוצר קישור-הזמנה חד-פעמי; הנמען נרשם דרכו ומצטרף כמנהל שווה-מעמד לארגון הקיים, עם דיאלוג ניהול מנהלים (רשימה, ביטול הזמנה, הסרת מנהל).

**Architecture:** טבלת `org_invites` + שלושה RPC בדפוס SECURITY DEFINER הקיים (כמו share/availability). route ציבורי `/join/:token` עם טופס הרשמה-בלי-ארגון, דיאלוג `TeamDialog` בסרגל, ופונקציות `acceptInvite`/`signUpAndJoin` ב-AuthContext. הידוק אגבי של policy `profile_create`.

**Tech Stack:** React 18 + TypeScript + Vite · Supabase (RLS + RPC) · shadcn/ui + Tailwind · vitest

**Spec:** `docs/superpowers/specs/2026-07-18-additional-admin-design.md` - לקרוא לפני תחילת עבודה.

## Global Constraints

- **עברית בלבד** בכל טקסט UI, הערות והודעות. מקף רגיל ( - ), לא מקף ארוך. בלי חצים (→) בטקסט עברי.
- **branch:** לעבוד על `feat/additional-admin` **בתיקיית הפרויקט הראשית** `c:\Projects\work_allocator\work-allocator` (לא worktree נפרד - memory: סוכנים מתעלמים מ-"work from"). כל משימה נפתחת ב: `cd c:\Projects\work_allocator\work-allocator && git branch --show-current` - אם התוצאה אינה `feat/additional-admin`, עצור ודווח.
- **שערים לכל משימה:** `npx tsc --noEmit` נקי + `npm test` ירוק לפני commit.
- כל פונקציות SQL חדשות: `SECURITY DEFINER SET search_path = public`.
- קובץ ה-SQL הוא מקור-אמת בלבד - **אין להריץ אותו על ה-DB במסגרת משימות 1-7**; ההחלה על ה-DB היא שלב-אינטגרציה נפרד (משימה 8) שמבצע המתזמר בלבד.
- אין להוסיף פיצ'רים מעבר למתואר (YAGNI). אין ריבוי-ארגונים, אין תפקידים מדורגים.

---

### Task 1: קובץ SQL - טבלה, RPC והידוק policy

**Files:**
- Create: `supabase_invites.sql`

**Interfaces:**
- Produces (למשימות 4-6, שמות מדויקים ל-rpc): `get_invite_context(invite_token TEXT)`, `accept_org_invite(invite_token TEXT, full_name TEXT)`, `remove_org_member(target_id UUID)`, טבלת `org_invites(token, org_id, created_by, created_at, expires_at, used_by, used_at)`.

- [ ] **Step 1: כתיבת הקובץ במלואו**

```sql
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

  INSERT INTO profiles (id, org_id, role, full_name, email)
  VALUES (auth.uid(), inv.org_id, 'admin', accept_org_invite.full_name, user_email);

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

GRANT EXECUTE ON FUNCTION org_has_members(TEXT) TO authenticated;

DROP POLICY IF EXISTS "profile_create" ON profiles;
CREATE POLICY "profile_create" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND NOT org_has_members(org_id));
```

- [ ] **Step 2: אימות סטטי**

Run: `npx tsc --noEmit && npm test`
Expected: ירוק (הקובץ לא משפיע על TS - זו בדיקת-שפיות שלא נשבר דבר).

- [ ] **Step 3: Commit**

```bash
git add supabase_invites.sql
git commit -m "feat: supabase_invites.sql - טבלת הזמנות, RPC הצטרפות/הסרה, הידוק profile_create"
```

---

### Task 2: לוגיקה טהורה - `src/lib/team.ts` (TDD)

**Files:**
- Create: `src/lib/team.ts`
- Test: `src/lib/team.test.ts`

**Interfaces:**
- Produces (למשימות 4-6): `InviteContext`, `InviteStatus`, `OrgMember`, `OrgInvite`, `INVITE_VALIDITY_DAYS`, `inviteLink(origin, token)`, `inviteExpiry(now)`, `classifyInvite(ctx)`, `pendingInvites(invites, now)`, `inviteErrorMessage(reason)`.

- [ ] **Step 1: כתיבת הבדיקות (נכשלות)**

`src/lib/team.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  inviteLink, inviteExpiry, classifyInvite, pendingInvites, inviteErrorMessage,
  INVITE_VALIDITY_DAYS, InviteContext, OrgInvite,
} from "./team";

describe("inviteLink", () => {
  it("בונה קישור הצטרפות מ-origin ו-token", () => {
    expect(inviteLink("https://work-allocator.vercel.app", "abc-123"))
      .toBe("https://work-allocator.vercel.app/join/abc-123");
  });
});

describe("inviteExpiry", () => {
  it("מחזיר מועד עתידי בדיוק לפי ימי התוקף", () => {
    const now = new Date("2026-07-18T10:00:00Z");
    const expiry = inviteExpiry(now);
    const diffDays = (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(INVITE_VALIDITY_DAYS);
  });
});

describe("classifyInvite", () => {
  it("null (token לא קיים) - not_found", () => {
    expect(classifyInvite(null)).toBe("not_found");
  });
  it("מחזיר את הסטטוס מהשרת כמו-שהוא", () => {
    const ctx: InviteContext = { orgName: "מרפאה", inviterName: "אמיר", status: "expired" };
    expect(classifyInvite(ctx)).toBe("expired");
    expect(classifyInvite({ ...ctx, status: "used" })).toBe("used");
    expect(classifyInvite({ ...ctx, status: "valid" })).toBe("valid");
  });
});

describe("pendingInvites", () => {
  const now = new Date("2026-07-18T10:00:00Z");
  const base = { created_at: "2026-07-17T10:00:00Z" };
  it("מסנן מומשות ופגות-תוקף, משאיר ממתינות", () => {
    const invites: OrgInvite[] = [
      { ...base, token: "a", expires_at: "2026-07-25T10:00:00Z", used_by: null },
      { ...base, token: "b", expires_at: "2026-07-25T10:00:00Z", used_by: "some-user" },
      { ...base, token: "c", expires_at: "2026-07-01T10:00:00Z", used_by: null },
    ];
    expect(pendingInvites(invites, now).map(i => i.token)).toEqual(["a"]);
  });
  it("רשימה ריקה נשארת ריקה", () => {
    expect(pendingInvites([], now)).toEqual([]);
  });
});

describe("inviteErrorMessage", () => {
  it("ממפה כל reason להודעה בעברית", () => {
    for (const reason of ["not_found", "used", "expired", "already_member", "self", "no_profile"]) {
      const msg = inviteErrorMessage(reason);
      expect(msg.length).toBeGreaterThan(5);
    }
  });
  it("reason לא מוכר או חסר - הודעה כללית", () => {
    expect(inviteErrorMessage(undefined)).toBe(inviteErrorMessage("whatever"));
  });
});
```

- [ ] **Step 2: הרצה לוודא כישלון**

Run: `npm test -- team`
Expected: FAIL - `Cannot find module './team'` (או שגיאת import דומה).

- [ ] **Step 3: מימוש `src/lib/team.ts`**

```ts
/** לוגיקה טהורה של הזמנות מנהלים - בלי תלות ב-Supabase (בדיק ב-vitest). */

export type InviteStatus = "valid" | "expired" | "used" | "not_found";

/** מה שמחזירה get_invite_context עבור token קיים. token לא קיים - null. */
export interface InviteContext {
  orgName: string | null;
  inviterName: string | null;
  status: "valid" | "expired" | "used";
}

/** שורת profiles כפי שנטענת לדיאלוג ניהול המנהלים. */
export interface OrgMember {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
}

/** שורת org_invites כפי שנטענת לדיאלוג. */
export interface OrgInvite {
  token: string;
  created_at: string;
  expires_at: string;
  used_by: string | null;
}

export const INVITE_VALIDITY_DAYS = 7;

export function inviteLink(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/** מועד פקיעה - חשבון מילישניות טהור, בלי פירוק תאריכים (בטוח-timezone). */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export function classifyInvite(ctx: InviteContext | null): InviteStatus {
  if (!ctx) return "not_found";
  return ctx.status;
}

/** הזמנות שעדיין רלוונטיות להצגה: לא מומשו ולא פגו. */
export function pendingInvites(invites: OrgInvite[], now: Date): OrgInvite[] {
  return invites.filter(i => !i.used_by && new Date(i.expires_at) > now);
}

const REASON_MESSAGES: Record<string, string> = {
  not_found:      "קישור ההזמנה אינו תקין",
  used:           "קישור ההזמנה כבר מומש - בקשו מהמנהל קישור חדש",
  expired:        "תוקף ההזמנה פג - בקשו מהמנהל קישור חדש",
  already_member: "החשבון שלך כבר שייך לארגון - לא ניתן להצטרף לארגון נוסף",
  self:           "לא ניתן להסיר את עצמך מהארגון",
  no_profile:     "החשבון שלך אינו משויך לארגון",
};

export function inviteErrorMessage(reason: string | undefined): string {
  return REASON_MESSAGES[reason ?? ""] ?? "שגיאה - נסו שוב";
}
```

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npm test -- team`
Expected: PASS, כל הבדיקות ירוקות. ואז `npx tsc --noEmit` נקי.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team.ts src/lib/team.test.ts
git commit -m "feat: לוגיקת הזמנות מנהלים - team.ts עם בדיקות"
```

---

### Task 3: שער Pro רדום - `canUseAdditionalAdmins`

**Files:**
- Modify: `src/lib/plan.ts` (הוספה בסוף הקובץ)
- Test: `src/lib/plan.test.ts` (הוספת בדיקה לקובץ הקיים)

**Interfaces:**
- Produces (למשימה 6): `canUseAdditionalAdmins(): boolean`.

- [ ] **Step 1: בדיקה נכשלת** - להוסיף ל-`src/lib/plan.test.ts` (לקרוא קודם את הקובץ ולהתאים לסגנון הקיים):

```ts
describe("canUseAdditionalAdmins", () => {
  it("פתוח לכולם כשהאכיפה כבויה", () => {
    expect(canUseAdditionalAdmins()).toBe(true);
  });
});
```

(עדכן את שורת ה-import בראש הקובץ להוסיף את `canUseAdditionalAdmins`.)

- [ ] **Step 2: הרצה לוודא כישלון**

Run: `npm test -- plan`
Expected: FAIL - `canUseAdditionalAdmins` אינו export קיים.

- [ ] **Step 3: מימוש** - להוסיף בסוף `src/lib/plan.ts`:

```ts
/**
 * הזמנת מנהל נוסף לארגון - פיצ'ר Pro (מועמד). כמו canUseAvailabilityInput -
 * קריאה טהורה בלי plan: כל עוד ENFORCE_QUOTA כבוי, פתוח לכולם. נקודת האכיפה
 * העתידית: כפתור "הזמנת מנהל" (מנהלים שכבר הצטרפו לא ננעלים).
 */
export function canUseAdditionalAdmins(): boolean {
  return !ENFORCE_QUOTA;
}
```

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npm test -- plan && npx tsc --noEmit`
Expected: PASS + נקי.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan.ts src/lib/plan.test.ts
git commit -m "feat: שער Pro רדום להזמנת מנהלים - canUseAdditionalAdmins"
```

---

### Task 4: AuthContext - `acceptInvite` ו-`signUpAndJoin`

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `inviteErrorMessage` מ-`@/lib/team` (Task 2).
- Produces (למשימה 5): בחתימת ה-context:
  `acceptInvite: (token: string, fullName: string) => Promise<{ error: string | null }>`
  `signUpAndJoin: (email: string, password: string, fullName: string, token: string) => Promise<{ error: string | null }>`

- [ ] **Step 1: הוספת הפונקציות**

ב-`src/contexts/AuthContext.tsx`:

1. הוסף import: `import { inviteErrorMessage } from "@/lib/team";`
2. הוסף לממשק `AuthContextValue` (אחרי `completeRegistration`):

```ts
  /** מימוש הזמנת-מנהל למשתמש מאומת (עם או בלי profile קודם) */
  acceptInvite: (token: string, fullName: string) => Promise<{ error: string | null }>;
  /** הרשמה + הצטרפות לארגון קיים דרך קישור הזמנה - בלי יצירת ארגון */
  signUpAndJoin: (email: string, password: string, fullName: string, token: string) => Promise<{ error: string | null }>;
```

3. הוסף בתוך `AuthProvider` (אחרי `completeRegistration`):

```ts
  // מימוש הזמנה: ה-RPC מאמת אטומית (token תקף, אין profile קיים) ויוצר את
  // ה-profile בצד השרת. שגיאות עסקיות חוזרות כ-{ok:false, reason} ולא כ-exception.
  const acceptInviteForUser = async (userId: string, token: string, fullName: string) => {
    if (!supabase) return { error: "Supabase לא מוגדר" };
    const { data, error } = await supabase.rpc("accept_org_invite", {
      invite_token: token,
      full_name: fullName.trim(),
    });
    if (error) {
      console.error("accept_org_invite failed:", error);
      return { error: "שגיאה בהצטרפות לארגון - נסו שוב" };
    }
    const result = data as { ok: boolean; reason?: string } | null;
    if (!result?.ok) return { error: inviteErrorMessage(result?.reason) };
    await loadProfile(userId);
    return { error: null };
  };

  const acceptInvite = async (token: string, fullName: string) => {
    if (!user) return { error: "לא מחובר" };
    return acceptInviteForUser(user.id, token, fullName);
  };

  // כשל ב-accept אחרי signUp מוצלח משאיר משתמש מאומת בלי profile - זרם
  // profileMissing הקיים הוא רשת הביטחון (JoinPage מטפל במצב הזה בטעינה מחדש).
  const signUpAndJoin = async (email: string, password: string, fullName: string, token: string) => {
    if (!supabase) return { error: "Supabase לא מוגדר" };
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) return { error: "שגיאה בהרשמה - בדוק שהמייל תקין והסיסמה עומדת בדרישות" };
    if (!data.user) return { error: "שגיאה ביצירת המשתמש" };
    return acceptInviteForUser(data.user.id, token, fullName);
  };
```

4. הוסף את `acceptInvite, signUpAndJoin` ל-value של ה-Provider (השורה עם `completeRegistration`).

- [ ] **Step 2: שערים**

Run: `npx tsc --noEmit && npm test`
Expected: נקי + ירוק.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: acceptInvite + signUpAndJoin ב-AuthContext"
```

---

### Task 5: עמוד ההצטרפות `/join/:token`

**Files:**
- Create: `src/pages/JoinPage.tsx`
- Modify: `src/pages/LoginPage.tsx` (רק export ל-PASSWORD_RULES ו-isPasswordValid)
- Modify: `src/App.tsx` (route ציבורי חדש)

**Interfaces:**
- Consumes: `get_invite_context` (rpc, Task 1) · `classifyInvite`, `InviteContext`, `inviteErrorMessage` (Task 2) · `acceptInvite`, `signUpAndJoin` (Task 4) · `PASSWORD_RULES`, `isPasswordValid` (LoginPage).

- [ ] **Step 1: export כללי הסיסמה**

ב-`src/pages/LoginPage.tsx` שנה את שתי ההגדרות המודוליות (שורות 11 ו-19 בערך) ל-export:

```ts
export const PASSWORD_RULES = [ ... ];   // התוכן הקיים ללא שינוי
export function isPasswordValid(p: string) { ... }   // התוכן הקיים ללא שינוי
```

- [ ] **Step 2: יצירת `src/pages/JoinPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { InviteContext, classifyInvite } from "@/lib/team";
import { PASSWORD_RULES, isPasswordValid } from "@/pages/LoginPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, UserPlus, CheckCircle2, XCircle } from "lucide-react";

/** מעטפת עמוד אחידה - כרטיס ממורכז באותה שפה עיצובית כמו CompleteRegistrationPage. */
function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-border/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-0.5 bg-primary" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">הצטרפות כמנהל</span>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { user, profile, org, loading: authLoading, acceptInvite, signUpAndJoin } = useAuth();
  const { toast } = useToast();

  const [ctx, setCtx] = useState<InviteContext | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!supabase || !token) { setCtxLoaded(true); return; }
    supabase.rpc("get_invite_context", { invite_token: token }).then(({ data, error }) => {
      if (error) console.error("get_invite_context failed:", error);
      setCtx((data as InviteContext | null) ?? null);
      setCtxLoaded(true);
    });
  }, [token]);

  if (!isSupabaseConfigured) {
    return <JoinShell><p className="text-sm text-muted-foreground">המערכת אינה מחוברת לענן.</p></JoinShell>;
  }

  if (!ctxLoaded || authLoading) {
    return (
      <JoinShell>
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </JoinShell>
    );
  }

  const status = classifyInvite(ctx);
  if (status !== "valid") {
    const message = {
      not_found: "קישור ההזמנה אינו תקין.",
      expired:   "תוקף ההזמנה פג. בקשו מהמנהל קישור חדש.",
      used:      "קישור ההזמנה כבר מומש. אם זה הייתם אתם - היכנסו למערכת כרגיל.",
    }[status];
    return (
      <JoinShell>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button className="w-full" onClick={() => window.location.assign("/")}>למסך הכניסה</Button>
      </JoinShell>
    );
  }

  // משתמש מחובר שכבר שייך לארגון - אין ריבוי-ארגונים
  if (user && profile) {
    return (
      <JoinShell>
        <p className="text-sm text-muted-foreground">
          החשבון {user.email} כבר שייך {org?.name ? `לארגון "${org.name}"` : "לארגון קיים"}.
          לא ניתן להצטרף לארגון נוסף עם אותו חשבון.
        </p>
        <Button className="w-full" onClick={() => window.location.assign("/")}>חזרה למערכת</Button>
      </JoinShell>
    );
  }

  // משתמש מאומת בלי profile (הרשמה שנקטעה) - מימוש ישיר, בלי הרשמה מחדש
  const isExistingUser = Boolean(user && !profile);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!isExistingUser && !isPasswordValid(password)) return;
    setSubmitting(true);
    const { error } = isExistingUser
      ? await acceptInvite(token, fullName)
      : await signUpAndJoin(email, password, fullName, token);
    if (error) {
      toast({ title: "שגיאה", description: error, variant: "destructive" });
      setSubmitting(false);
    } else {
      toast({ title: "ברוכים הבאים!", description: `הצטרפת לארגון "${ctx?.orgName}"` });
      window.location.assign("/");
    }
  };

  return (
    <JoinShell>
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary flex items-center gap-2">
        <UserPlus className="h-4 w-4 shrink-0" />
        <span>
          הוזמנת לנהל את הארגון "{ctx?.orgName}"
          {ctx?.inviterName ? ` (ע"י ${ctx.inviterName})` : ""}
        </span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">שמך המלא</Label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="ישראל ישראלי" className="pr-9" required />
          </div>
        </div>
        {!isExistingUser && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">אימייל</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" className="pr-9" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">סיסמה</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 8 תווים" className="pr-9" required />
              </div>
              {password.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {PASSWORD_RULES.map(rule => {
                    const ok = rule.test(password);
                    return (
                      <li key={rule.id} className={`flex items-center gap-2 text-xs ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
        {isExistingUser && (
          <p className="text-xs text-muted-foreground">מצטרפים עם החשבון הקיים {user?.email}.</p>
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90"
          disabled={submitting || (!isExistingUser && !isPasswordValid(password))}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "הצטרפות לארגון"}
        </Button>
      </form>
    </JoinShell>
  );
}
```

- [ ] **Step 3: route ב-`src/App.tsx`**

הוסף import: `import { JoinPage } from "@/pages/JoinPage";`
ב-`AppContent`, אחרי ה-route של `/s/:token`:

```tsx
      {/* עמוד ציבורי - הצטרפות מנהל דרך קישור הזמנה */}
      <Route path="/join/:token" element={<JoinPage />} />
```

- [ ] **Step 4: שערים**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: הכל נקי.

- [ ] **Step 5: Commit**

```bash
git add src/pages/JoinPage.tsx src/pages/LoginPage.tsx src/App.tsx
git commit -m "feat: עמוד הצטרפות מנהל /join/:token"
```

---

### Task 6: דיאלוג ניהול מנהלים + כפתור בסרגל

**Files:**
- Create: `src/components/TeamDialog.tsx`
- Modify: `src/pages/Index.tsx` (כפתור בסרגל + רינדור הדיאלוג + state)

**Interfaces:**
- Consumes: `OrgMember`, `OrgInvite`, `inviteLink`, `inviteExpiry`, `pendingInvites`, `inviteErrorMessage` (Task 2) · `canUseAdditionalAdmins` (Task 3) · rpc `remove_org_member` וטבלת `org_invites` (Task 1).

- [ ] **Step 1: יצירת `src/components/TeamDialog.tsx`**

```tsx
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { OrgMember, OrgInvite, inviteLink, inviteExpiry, pendingInvites, inviteErrorMessage } from "@/lib/team";
import { canUseAdditionalAdmins } from "@/lib/plan";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Copy, Trash2, Loader2, Check, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

// ניהול מנהלי הארגון: רשימה, הזמנה בקישור חד-פעמי, ביטול הזמנה, הסרת מנהל.
export function TeamDialog({ open, onOpenChange, orgId }: TeamDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  // fallback כשה-clipboard לא זמין: מציגים את הקישור לסימון ידני
  const [manualLink, setManualLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [profilesRes, invitesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, created_at")
        .eq("org_id", orgId).order("created_at"),
      supabase.from("org_invites").select("token, created_at, expires_at, used_by")
        .eq("org_id", orgId).order("created_at", { ascending: false }),
    ]);
    if (profilesRes.error) console.error("טעינת מנהלים נכשלה:", profilesRes.error);
    if (invitesRes.error) console.error("טעינת הזמנות נכשלה:", invitesRes.error);
    setMembers((profilesRes.data ?? []) as OrgMember[]);
    setInvites(pendingInvites((invitesRes.data ?? []) as OrgInvite[], new Date()));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (open) { setConfirmRemoveId(null); setManualLink(null); load(); }
  }, [open, load]);

  const copyLink = async (token: string) => {
    const link = inviteLink(window.location.origin, token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setManualLink(link);
    }
  };

  const handleCreateInvite = async () => {
    if (!supabase || !user) return;
    const token = crypto.randomUUID();
    const { error } = await supabase.from("org_invites").insert({
      token,
      org_id: orgId,
      created_by: user.id,
      expires_at: inviteExpiry(new Date()).toISOString(),
    });
    if (error) {
      console.error("יצירת הזמנה נכשלה:", error);
      toast({ title: "שגיאה ביצירת ההזמנה", variant: "destructive" });
      return;
    }
    setInvites(prev => [{ token, created_at: new Date().toISOString(), expires_at: inviteExpiry(new Date()).toISOString(), used_by: null }, ...prev]);
    await copyLink(token);
    toast({ title: "קישור ההזמנה נוצר", description: "שלחו אותו למנהל החדש - תקף לשבוע, לשימוש חד-פעמי" });
  };

  const handleCancelInvite = async (token: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("org_invites").delete().eq("token", token);
    if (error) {
      console.error("ביטול הזמנה נכשל:", error);
      toast({ title: "שגיאה בביטול ההזמנה", variant: "destructive" });
      return;
    }
    setInvites(prev => prev.filter(i => i.token !== token));
    toast({ title: "ההזמנה בוטלה" });
  };

  const handleRemove = async (member: OrgMember) => {
    if (!supabase) return;
    if (confirmRemoveId !== member.id) { setConfirmRemoveId(member.id); return; }
    const { data, error } = await supabase.rpc("remove_org_member", { target_id: member.id });
    if (error) {
      console.error("remove_org_member failed:", error);
      toast({ title: "שגיאה בהסרת המנהל", variant: "destructive" });
      return;
    }
    const result = data as { ok: boolean; reason?: string } | null;
    if (!result?.ok) {
      toast({ title: inviteErrorMessage(result?.reason), variant: "destructive" });
      return;
    }
    setMembers(prev => prev.filter(m => m.id !== member.id));
    setConfirmRemoveId(null);
    toast({ title: `${member.full_name ?? member.email ?? "המנהל"} הוסר מהארגון` });
  };

  const memberSince = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("he-IL") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> ניהול מנהלים
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          כל מנהל בארגון שווה-מעמד: עובדים, שיבוץ, פרסום והזמנת מנהלים נוספים.
        </p>
        {manualLink && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ההעתקה האוטומטית נכשלה - סמנו והעתיקו ידנית:</p>
            <Input readOnly value={manualLink} dir="ltr" onFocus={e => e.target.select()} />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* מנהלי הארגון */}
            <div className="space-y-1">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.full_name ?? m.email ?? "ללא שם"}
                      {m.id === user?.id && <span className="text-xs text-muted-foreground"> (אני)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email} · הצטרף {memberSince(m.created_at)}</p>
                  </div>
                  {m.id !== user?.id && (
                    <Button
                      size="sm"
                      variant={confirmRemoveId === m.id ? "destructive" : "ghost"}
                      onClick={() => handleRemove(m)}
                      title={confirmRemoveId === m.id ? "לחצו שוב לאישור ההסרה" : "הסר מהארגון"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmRemoveId === m.id && <span className="mr-1 text-xs">בטוח?</span>}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* הזמנות ממתינות */}
            {invites.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">הזמנות ממתינות</p>
                {invites.map(inv => (
                  <div key={inv.token} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-accent/30">
                    <span className="text-xs text-muted-foreground">
                      בתוקף עד {new Date(inv.expires_at).toLocaleDateString("he-IL")}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
                        {copiedToken === inv.token
                          ? <><Check className="h-3.5 w-3.5 ml-1 text-emerald-500" /> הועתק</>
                          : <><Copy className="h-3.5 w-3.5 ml-1" /> העתק קישור</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancelInvite(inv.token)} title="בטל הזמנה">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* יצירת הזמנה */}
            {canUseAdditionalAdmins() && (
              <Button className="w-full" variant="outline" onClick={handleCreateInvite}>
                <UserPlus className="h-4 w-4 ml-1" /> הזמנת מנהל חדש
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: חיבור ב-`src/pages/Index.tsx`**

1. import (ליד שאר ייבואי הקומפוננטות, שורה ~21): `import { TeamDialog } from "@/components/TeamDialog";`
2. הוסף `UserPlus` לייבוא הקיים מ-lucide-react (שורות 28-32).
3. state (ליד `shareDialogOpen`, שורה ~224): `const [teamDialogOpen, setTeamDialogOpen] = useState(false);`
4. כפתור בסרגל - לפני `<HelpDialog />` (שורה ~932):

```tsx
            {isSupabaseConfigured && profile?.org_id && (
              <Button variant="ghost" size="icon" onClick={() => setTeamDialogOpen(true)}
                title="ניהול מנהלים" className="rounded-xl hover:bg-primary/10">
                <UserPlus className="h-5 w-5" />
              </Button>
            )}
```

5. רינדור הדיאלוג - מיד אחרי בלוק `ShareLinksDialog` (שורה ~1430):

```tsx
      {/* Team management dialog */}
      {isSupabaseConfigured && profile?.org_id && (
        <TeamDialog
          open={teamDialogOpen}
          onOpenChange={setTeamDialogOpen}
          orgId={profile.org_id}
        />
      )}
```

- [ ] **Step 3: שערים**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: הכל נקי וירוק.

- [ ] **Step 4: Commit**

```bash
git add src/components/TeamDialog.tsx src/pages/Index.tsx
git commit -m "feat: דיאלוג ניהול מנהלים + כפתור בסרגל"
```

---

### Task 7: עדכון מדריך המשתמש (md + PDF)

**Files:**
- Modify: `public/user-guide.md`
- Regenerate: `public/user-guide.pdf`

- [ ] **Step 1: הוספת פרק למדריך**

ב-`public/user-guide.md`, אחרי תת-הפרק "### מצב סנכרון" (שורה ~57, בתוך פרק "התחברות וחשבון"), הוסף:

```markdown
### מנהל נוסף בארגון

אפשר לצרף מנהלים נוספים לארגון - כל מנהל שווה-מעמד ויכול לנהל עובדים, שיבוץ ופרסום.

1. לוחצים על סמל ניהול המנהלים בסרגל העליון (אייקון הוספת-משתמש).
2. לוחצים "הזמנת מנהל חדש" - נוצר קישור חד-פעמי (תקף לשבוע) והוא מועתק אוטומטית.
3. שולחים את הקישור למנהל החדש (וואטסאפ/מייל). הוא פותח, ממלא שם, מייל וסיסמה - ומצטרף מיד.

באותו חלון אפשר גם לבטל הזמנה שטרם מומשה ולהסיר מנהל מהארגון (לא את עצמך).
```

עדכן גם את תוכן העניינים (שורות 7-19) אם תתי-הפרקים מופיעים בו.

- [ ] **Step 2: יצירת ה-PDF מחדש**

התהליך המתועד (memory: project_user_guides): המרה ל-HTML עם `npx -y marked`, עטיפה בתבנית RTL, הדפסה ב-Chrome headless. צור קובץ עזר זמני `%TEMP%`-בסגנון בתיקיית scratchpad (לא בריפו):

`wrap.html` (תבנית - להזרים את פלט marked לתוך ה-body):

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; direction: rtl; max-width: 800px; margin: 2em auto; line-height: 1.6; }
  h1, h2, h3 { color: #0f766e; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
<!-- BODY -->
</body>
</html>
```

פקודות (Git Bash):

```bash
npx -y marked -i public/user-guide.md -o /tmp_guide_body.html   # או לתיקיית scratchpad
# להרכיב את הקובץ המלא (להחליף את <!-- BODY --> בתוכן), ואז:
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf="C:\\Projects\\work_allocator\\work-allocator\\public\\user-guide.pdf" \
  "<נתיב ה-HTML המלא>"
```

- [ ] **Step 3: אימות ויזואלי של ה-PDF**

פתח את ה-PDF (או קרא אותו ב-Read) וודא: הפרק החדש מופיע, עברית RTL תקינה, אין ג'יבריש.

- [ ] **Step 4: Commit**

```bash
git add public/user-guide.md public/user-guide.pdf
git commit -m "docs: מדריך משתמש - פרק מנהל נוסף בארגון (md+PDF)"
```

---

### Task 8: אינטגרציה - החלת SQL, בדיקת-עשן, מיזוג ופריסה (מתזמר בלבד)

**משימה זו מבוצעת ע"י המתזמר בסשן הראשי (גישת Supabase MCP), לא ע"י סוכן-משנה.**

- [ ] **Step 1: סקירת-ענף סופית** לפי superpowers:requesting-code-review (סוקר Opus, כמקובל בפרויקט) - לפני ההחלה על ה-DB.
- [ ] **Step 2: החלת `supabase_invites.sql`** דרך `mcp__supabase__apply_migration` (name: `org_invites_additional_admin`).
- [ ] **Step 3: בדיקת-עשן SQL** דרך `mcp__supabase__execute_sql`:
  - `get_invite_context('no-such-token')` מחזיר NULL.
  - INSERT הזמנת-בדיקה עם org קיים, `get_invite_context` מחזיר valid עם orgName; עדכון ידני `expires_at=NOW()-interval '1 day'` ואימות expired; ניקוי מלא (DELETE).
  - אימות ה-policy החדש: `SELECT COUNT(*) FROM pg_policies WHERE tablename='profiles' AND policyname='profile_create'` = 1.
  - `get_advisors(security)` - בלי ERROR חדשים (אזהרות anon-RPC צפויות ומכוונות).
- [ ] **Step 4: מיזוג ל-main ופריסה** - fast-forward merge, push (הפריסה אוטומטית ב-GitHub Actions), מעקב שה-run ירוק.
- [ ] **Step 5: אימות חי בפרודקשן** - זרם מלא: יצירת קישור הזמנה מחשבון אמיר (או חשבון בדיקה), פתיחה בחלון גלישה בסתר, הרשמה והצטרפות, אימות שהמנהל החדש רואה את נתוני הארגון, הסרתו וניקוי. עדכון memory.

## Self-Review (בוצע בכתיבה)

- **כיסוי spec:** טבלה+RPC+הידוק (Task 1) · route+עמוד (Task 5) · דיאלוג+סרגל (Task 6) · AuthContext (Task 4) · שער Pro (Task 3) · לוגיקה+בדיקות (Task 2) · מדריך (Task 7) · החלה+עשן+אימות-חי (Task 8). אין פער.
- **עקביות שמות:** `get_invite_context(invite_token)` / `accept_org_invite(invite_token, full_name)` / `remove_org_member(target_id)` אחידים בין Task 1 לקריאות ה-rpc במשימות 4-6. `inviteErrorMessage` מכסה גם reasons של remove (`self`, `no_profile`).
- **סריקת placeholders:** אין - כל הקוד מלא וסופי (הודעת "כבר שייך לארגון" משתמשת ב-`org` מה-context).
