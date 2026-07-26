// בדיקה מול HaveIBeenPwned: האם הסיסמה שנבחרה כבר הופיעה בדליפה ידועה.
//
// Supabase מציעה את זה כפיצ'ר מובנה, אבל **רק ב-Pro Plan** - החשבון של
// הפרויקט הוא Free והמתג אינו מופיע (נבדק בשטח 26/7). זהו אותו מנגנון בדיוק,
// בצד-לקוח.
//
// ── k-anonymity: למה זה לא מדליף את הסיסמה ────────────────────────────────
// מחשבים SHA-1 מקומית, ושולחים ל-API רק את **5 התווים הראשונים** של ה-hash.
// השרת מחזיר את כל הסיומות שמתחילות באותו תחילית (מאות תוצאות), וההשוואה
// נעשית מקומית. לא הסיסמה, ולא ה-hash המלא שלה, עוזבים את הדפדפן.
// `Add-Padding` מבקש ריפוד תוצאות, כדי שגם גודל-התשובה לא ידליף מידע.
//
// ── כשל-פתוח, במכוון ──────────────────────────────────────────────────────
// כל תקלה - רשת, שירות למטה, דפדפן בלי crypto.subtle - מחזירה null, והקורא
// ממשיך כרגיל. בדיקת-סיסמה של צד שלישי לעולם לא תחסום כניסה למערכת.
//
// מגבלה ידועה: זו בדיקה בצד-לקוח וניתן לעקוף אותה. האיום שהיא מטפלת בו אינו
// תוקף מתוחכם אלא משתמש שבוחר סיסמה שכבר דלפה - ומול זה היא יעילה.

export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** גוף התשובה הוא שורות `SUFFIX:COUNT`. מחזיר את המונה של הסיומת, או 0. */
export function parsePwnedRange(body: string, suffix: string): number {
  const target = suffix.trim().toUpperCase();
  for (const line of body.split("\n")) {
    const [lineSuffix, count] = line.trim().split(":");
    if (!lineSuffix || lineSuffix.toUpperCase() !== target) continue;
    const parsed = Number.parseInt(count, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** null = לא ניתן היה לבדוק (ואז ממשיכים כרגיל - ראו "כשל-פתוח" למעלה). */
export async function isPasswordPwned(
  password: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ pwned: boolean; count: number } | null> {
  if (!password) return null;
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetchImpl(`${PWNED_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;

    const count = parsePwnedRange(await res.text(), suffix);
    return { pwned: count > 0, count };
  } catch {
    return null;
  }
}

/** הודעה למשתמש. המספר המדויק ממחיש שזו לא אזהרה תיאורטית. */
export function pwnedMessage(count: number): string {
  return `הסיסמה הזו מופיעה ב-${count.toLocaleString("he-IL")} דליפות ידועות - בחרו סיסמה אחרת`;
}
