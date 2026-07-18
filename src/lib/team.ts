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
