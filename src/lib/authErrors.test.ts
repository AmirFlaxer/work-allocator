import { describe, it, expect } from "vitest";
import { signUpErrorMessage, isAlreadyRegistered, isDuplicateProfile } from "@/lib/authErrors";

describe("signUpErrorMessage", () => {
  it("מייל כבר רשום - מפנה להתחברות ולא לבדיקת פורמט", () => {
    const msg = signUpErrorMessage({ message: "User already registered", code: "user_already_exists" });
    expect(msg).toContain("כבר רשומה");
    expect(msg).not.toContain("תווים");
  });

  it("סיסמה חלשה", () => {
    expect(signUpErrorMessage({ message: "Password should be at least 8 characters", code: "weak_password" }))
      .toContain("סיסמה");
  });

  it("מייל לא תקין", () => {
    expect(signUpErrorMessage({ message: "Unable to validate email address", code: "email_address_invalid" }))
      .toContain("מייל");
  });

  it("שגיאה לא מוכרת - הודעה גנרית, בלי ניחוש על אורך סיסמה", () => {
    const msg = signUpErrorMessage({ message: "network unreachable" });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain("6 תווים");
  });

  it("עמיד לשגיאה ריקה", () => {
    expect(signUpErrorMessage(null).length).toBeGreaterThan(0);
    expect(signUpErrorMessage({}).length).toBeGreaterThan(0);
  });
});

describe("isAlreadyRegistered", () => {
  // כש-mailer_autoconfirm דלוק, הרשמה עם מייל קיים חוזרת כהצלחה עם
  // identities ריק - הסתרת-קיום מכוונת של Supabase. בלי הזיהוי הזה הקוד
  // ממשיך ליצירת ארגון, נכשל על מפתח כפול, והמשתמש מקבל "נסה שוב" לנצח.
  it("identities ריק פירושו מייל קיים", () => {
    expect(isAlreadyRegistered({ identities: [] })).toBe(true);
  });

  it("identities מלא פירושו משתמש חדש", () => {
    expect(isAlreadyRegistered({ identities: [{ id: "x" }] })).toBe(false);
  });

  it("היעדר identities לא נחשב מייל קיים", () => {
    expect(isAlreadyRegistered({})).toBe(false);
    expect(isAlreadyRegistered(null)).toBe(false);
  });
});

describe("isDuplicateProfile", () => {
  it("הפרת מפתח ייחודי", () => {
    expect(isDuplicateProfile({ code: "23505" })).toBe(true);
  });

  it("שגיאה אחרת", () => {
    expect(isDuplicateProfile({ code: "42501" })).toBe(false);
    expect(isDuplicateProfile(null)).toBe(false);
  });
});
