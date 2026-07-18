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
  it("not_found - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("not_found")).toBe("קישור ההזמנה אינו תקין");
  });
  it("used - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("used")).toBe("קישור ההזמנה כבר מומש - בקשו מהמנהל קישור חדש");
  });
  it("expired - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("expired")).toBe("תוקף ההזמנה פג - בקשו מהמנהל קישור חדש");
  });
  it("already_member - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("already_member")).toBe("החשבון שלך כבר שייך לארגון - לא ניתן להצטרף לארגון נוסף");
  });
  it("self - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("self")).toBe("לא ניתן להסיר את עצמך מהארגון");
  });
  it("no_profile - הודעה מדויקת בעברית", () => {
    expect(inviteErrorMessage("no_profile")).toBe("החשבון שלך אינו משויך לארגון");
  });
  it("reason לא מוכר או חסר - הודעה כללית", () => {
    expect(inviteErrorMessage(undefined)).toBe("שגיאה - נסו שוב");
    expect(inviteErrorMessage("whatever")).toBe("שגיאה - נסו שוב");
  });
});
