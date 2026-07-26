// מיפוי שגיאות-הרשמה להודעה שאומרת למשתמש מה לעשות.
// ההודעה הקודמת הייתה ניחוש אחד לכל התקלות ("בדוק שהמייל תקין והסיסמה ארוכה
// מ-6 תווים") - גם מטעה (ה-UI דורש 8) וגם חסרת-פעולה: מנהל שכבר נרשם קיבל
// הנחיה לבדוק פורמט במקום פשוט להתחבר.

interface SupabaseError { message?: string; code?: string }

export function signUpErrorMessage(error: SupabaseError | null | undefined): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "כתובת המייל כבר רשומה במערכת - נסו להתחבר מלשונית \"כניסה\"";
  }
  if (code === "weak_password" || message.includes("password")) {
    return "הסיסמה אינה עומדת בדרישות - ראו את הרשימה מתחת לשדה";
  }
  if (code === "email_address_invalid" || message.includes("email")) {
    return "כתובת המייל אינה תקינה";
  }
  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "יותר מדי נסיונות - המתינו דקה ונסו שוב";
  }
  return "ההרשמה נכשלה - נסו שוב, ואם זה חוזר פנו למפתח";
}

// כש-mailer_autoconfirm דלוק, הרשמה עם מייל שכבר קיים אינה מחזירה שגיאה אלא
// משתמש מעורפל עם identities ריק - הסתרת-קיום מכוונת של Supabase, כדי שלא
// יהיה אפשר למפות מי רשום. בלי לזהות את זה הקוד ממשיך ליצירת ארגון, נכשל על
// מפתח כפול ב-profiles, והמשתמש תקוע על "נסה שוב" בלי דרך להבין שעליו להתחבר.
export function isAlreadyRegistered(user: { identities?: unknown[] } | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

// 23505 = unique_violation. ב-profiles פירושו שלמשתמש כבר יש פרופיל.
export function isDuplicateProfile(error: SupabaseError | null | undefined): boolean {
  return error?.code === "23505";
}

// בקשת-שחזור: אין להסגיר אם הכתובת רשומה. השגיאה היחידה ששווה להציג היא
// חסימת-קצב, כי היא מסבירה למה כלום לא קרה ומה לעשות (להמתין).
export function resetRequestErrorMessage(error: SupabaseError | null | undefined): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "נשלחו יותר מדי בקשות - המתינו דקה ונסו שוב";
  }
  return "שליחת המייל נכשלה - נסו שוב, ואם זה חוזר פנו למפתח";
}

// קביעת סיסמה חדשה. "same_password" הוא המקרה השכיח: מי ששכח סיסמה מנחש את
// הישנה ומקבל שגיאה שבלי תרגום נראית כתקלה במערכת.
export function updatePasswordErrorMessage(error: SupabaseError | null | undefined): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "same_password" || message.includes("should be different")) {
    return "הסיסמה החדשה זהה לקודמת - בחרו סיסמה אחרת";
  }
  if (code === "weak_password" || message.includes("password")) {
    return "הסיסמה אינה עומדת בדרישות - ראו את הרשימה מתחת לשדה";
  }
  // קישור-שחזור תקף לזמן מוגבל; בלי ההודעה הזו המשתמש לא מבין למה זה נכשל.
  if (message.includes("expired") || message.includes("invalid") || code === "session_not_found") {
    return "קישור השחזור פג או כבר נוצל - בקשו קישור חדש ממסך הכניסה";
  }
  return "עדכון הסיסמה נכשל - נסו שוב";
}
