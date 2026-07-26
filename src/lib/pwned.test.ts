import { describe, it, expect, vi } from "vitest";
import { parsePwnedRange, isPasswordPwned, PWNED_RANGE_URL } from "@/lib/pwned";

// SHA-1 של "password" = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PASSWORD_PREFIX = "5BAA6";
const PASSWORD_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

const okResponse = (body: string) =>
  ({ ok: true, text: async () => body }) as Response;

describe("parsePwnedRange", () => {
  it("מוצא את הסיומת ומחזיר את מספר הפעמים", () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${PASSWORD_SUFFIX}:24230577\r\n`;
    expect(parsePwnedRange(body, PASSWORD_SUFFIX)).toBe(24230577);
  });

  it("סיומת שאינה ברשימה מחזירה 0", () => {
    expect(parsePwnedRange("AAAA:5\r\nBBBB:7\r\n", PASSWORD_SUFFIX)).toBe(0);
  });

  it("עמיד לשוני באותיות רישיות ולרווחים", () => {
    const body = `  ${PASSWORD_SUFFIX.toLowerCase()}:42  \n`;
    expect(parsePwnedRange(body, PASSWORD_SUFFIX)).toBe(42);
  });

  it("שורות פגומות אינן מפילות", () => {
    expect(parsePwnedRange("garbage\n\n:::\n", PASSWORD_SUFFIX)).toBe(0);
  });

  it("גוף ריק מחזיר 0", () => {
    expect(parsePwnedRange("", PASSWORD_SUFFIX)).toBe(0);
  });
});

describe("isPasswordPwned", () => {
  // ההבטחה המרכזית: הסיסמה, וגם ה-hash המלא שלה, לא עוזבים את הדפדפן.
  // נשלחים 5 תווים בלבד (k-anonymity). זו הבדיקה שמגינה על ההבטחה הזו.
  it("שולח 5 תווים בלבד - לא את הסיסמה ולא את ה-hash המלא", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okResponse(""));
    await isPasswordPwned("password", fetchMock);

    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`${PWNED_RANGE_URL}${PASSWORD_PREFIX}`);
    expect(url).not.toContain(PASSWORD_SUFFIX);
    // רק החלק שאחרי כתובת-הבסיס נשלח כמידע. שם-הדומיין עצמו מכיל את המילה
    // "passwords", ולכן חיפוש נאיבי על ה-URL המלא היה נכשל תמיד.
    const sent = url.slice(PWNED_RANGE_URL.length);
    expect(sent).toHaveLength(5);
    expect(sent).toBe(PASSWORD_PREFIX);
  });

  it("הסיסמה עצמה לא מופיעה בכתובת שנשלחת", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okResponse(""));
    const secret = "Zq7-Miklat-Nachal-88";
    await isPasswordPwned(secret, fetchMock);
    expect(fetchMock.mock.calls[0][0]).not.toContain(secret);
  });

  it("מזהה סיסמה דלופה", async () => {
    const fetchMock = vi.fn(async () => okResponse(`${PASSWORD_SUFFIX}:24230577`));
    expect(await isPasswordPwned("password", fetchMock)).toEqual({ pwned: true, count: 24230577 });
  });

  it("סיסמה שאינה ברשימה", async () => {
    const fetchMock = vi.fn(async () => okResponse("AAAA:1"));
    expect(await isPasswordPwned("password", fetchMock)).toEqual({ pwned: false, count: 0 });
  });

  // כשל-פתוח: תקלת-רשת של צד שלישי לעולם לא תחסום הרשמה.
  it("כשל ברשת מחזיר null ולא זורק", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    expect(await isPasswordPwned("password", fetchMock)).toBeNull();
  });

  it("תשובה שאינה ok מחזירה null", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, text: async () => "" }) as Response);
    expect(await isPasswordPwned("password", fetchMock)).toBeNull();
  });

  it("סיסמה ריקה אינה נבדקת כלל - אין קריאת-רשת", async () => {
    const fetchMock = vi.fn(async () => okResponse(""));
    expect(await isPasswordPwned("", fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
