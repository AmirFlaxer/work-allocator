import { describe, it, expect } from "vitest";
import {
  signUpErrorMessage, isAlreadyRegistered, isDuplicateProfile,
  resetRequestErrorMessage, updatePasswordErrorMessage,
  signInErrorMessage, isServerUnreachable,
} from "@/lib/authErrors";

// כך supabase-js מחזיר כשל-רשת: DNS שלא נפתר (פרויקט מושהה), אין אינטרנט,
// או 502-504 בדקות שהשרת עולה. כולם AuthRetryableFetchError.
const fetchFailed = { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 };
const badGateway  = { name: "AuthRetryableFetchError", message: "Bad Gateway", status: 502 };

describe("isServerUnreachable", () => {
  it("כשל-רשת ו-502 בזמן עלייה", () => {
    expect(isServerUnreachable(fetchFailed)).toBe(true);
    expect(isServerUnreachable(badGateway)).toBe(true);
  });

  it("זיהוי לפי status גם בלי שם-המחלקה", () => {
    expect(isServerUnreachable({ status: 0 })).toBe(true);
    expect(isServerUnreachable({ status: 503 })).toBe(true);
  });

  it("שגיאה עסקית מהשרת אינה 'לא עונה'", () => {
    expect(isServerUnreachable({ code: "invalid_credentials", status: 400 })).toBe(false);
    expect(isServerUnreachable(null)).toBe(false);
  });
});

describe("signInErrorMessage", () => {
  // התקרית של 22/10/2026: הפרויקט הושהה, וכל ניסיון כניסה הציג "סיסמה שגויה" -
  // המשתמש ניסה סיסמאות ושחזור במקום לדעת שהשרת פשוט לא עונה.
  it("שרת לא עונה - לא מאשים את הסיסמה", () => {
    for (const e of [fetchFailed, badGateway]) {
      const msg = signInErrorMessage(e);
      expect(msg).toContain("אין חיבור לשרת");
      expect(msg).not.toContain("סיסמה");
    }
  });

  it("פרטים שגויים", () => {
    expect(signInErrorMessage({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }))
      .toBe("מייל או סיסמה שגויים");
  });

  it("חסימת-קצב מוסברת עם פעולה", () => {
    expect(signInErrorMessage({ code: "over_request_rate_limit", status: 429 })).toContain("המתינו");
  });

  it("שגיאה לא מוכרת - הודעה גנרית ולא ניחוש על הסיסמה", () => {
    const msg = signInErrorMessage({ code: "unexpected_failure", status: 500 });
    expect(msg).not.toContain("שגויים");
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("שרת לא עונה - בכל מסלולי-האימות", () => {
  it("הרשמה, בקשת-שחזור וקביעת-סיסמה", () => {
    expect(signUpErrorMessage(fetchFailed)).toContain("אין חיבור לשרת");
    expect(resetRequestErrorMessage(fetchFailed)).toContain("אין חיבור לשרת");
    expect(updatePasswordErrorMessage(badGateway)).toContain("אין חיבור לשרת");
  });
});

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

describe("resetRequestErrorMessage", () => {
  it("חסימת-קצב מוסברת עם פעולה", () => {
    expect(resetRequestErrorMessage({ code: "over_email_send_rate_limit" })).toContain("המתינו");
  });

  it("אינה מסגירה אם הכתובת רשומה", () => {
    const msg = resetRequestErrorMessage({ message: "user not found" });
    expect(msg).not.toContain("רשומה");
    expect(msg).not.toContain("לא נמצא");
  });
});

describe("updatePasswordErrorMessage", () => {
  it("סיסמה זהה לקודמת - המקרה השכיח של מי ששכח", () => {
    expect(updatePasswordErrorMessage({ code: "same_password" })).toContain("זהה לקודמת");
  });

  it("קישור שפג מוסבר עם הדרך הלאה", () => {
    expect(updatePasswordErrorMessage({ message: "Token has expired" })).toContain("קישור");
  });

  it("סיסמה חלשה", () => {
    expect(updatePasswordErrorMessage({ code: "weak_password" })).toContain("דרישות");
  });

  it("עמיד לשגיאה ריקה", () => {
    expect(updatePasswordErrorMessage(null).length).toBeGreaterThan(0);
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
