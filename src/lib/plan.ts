import { supabase } from "@/lib/supabase";

/**
 * תשתית freemium - בנויה מראש אך רדומה (ראו ENFORCE_QUOTA).
 * תוכנן ב-docs/superpowers/specs/2026-07-11-freemium-design.md:
 * חינם עד 10 עובדים / 6 עמדות / עובד אחד לעמדה / בלי דוחות חודשיים.
 * עיקרון: לא נועלים נתונים קיימים - רק הוספה חדשה מעבר למכסה נחסמת.
 */

export type Plan = "free" | "pro";

// מתג ראשי - כבוי. יופעל (true) רק כשמודל התשלום יעלה בפועל
// (צ'קליסט ההפעלה נמצא ב-spec). עד אז כל הבדיקות כאן מתירות הכל.
export const ENFORCE_QUOTA = false;

export const FREE_EMPLOYEE_LIMIT = 10;
export const FREE_STATION_LIMIT = 6;

/**
 * תוכנית הארגון לפי טבלת subscriptions. "free" היא ברירת המחדל - גם כשאין
 * רשומה, וגם כשה-status אינו active. הטבלה עשויה עוד לא להתקיים בפרודקשן
 * (supabase_freemium.sql מורץ ידנית) - כל שגיאה נתפסת ומחזירה "free".
 */
export async function getOrgPlan(orgId: string): Promise<Plan> {
  try {
    if (!supabase) return "free";
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error || !data) return "free";
    if (data.status !== "active") return "free";
    return data.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

/** האם הוספת עובד נוסף חורגת מהמכסה. כשהמתג כבוי - תמיד מותר. */
export function isOverEmployeeQuota(plan: Plan, currentCount: number): boolean {
  if (!ENFORCE_QUOTA || plan === "pro") return false;
  return currentCount >= FREE_EMPLOYEE_LIMIT;
}

/** האם הוספת עמדה נוספת חורגת מהמכסה. כשהמתג כבוי - תמיד מותר. */
export function isOverStationQuota(plan: Plan, currentCount: number): boolean {
  if (!ENFORCE_QUOTA || plan === "pro") return false;
  return currentCount >= FREE_STATION_LIMIT;
}

/** עמדה עם יותר מעובד אחד בו-זמנית (requiredCount > 1) - פיצ'ר Pro. */
export function canUseMultiSlotStations(plan: Plan): boolean {
  if (!ENFORCE_QUOTA) return true;
  return plan === "pro";
}

/** דוחות חודשיים לחשבות - פיצ'ר Pro. */
export function canUseMonthlyReports(plan: Plan): boolean {
  if (!ENFORCE_QUOTA) return true;
  return plan === "pro";
}

/**
 * הזנת זמינות ע"י העובד עצמו דרך הקישור האישי - פיצ'ר Pro.
 * ללא פרמטר plan (בשונה מיתר הבדיקות): נקראת מעמוד השיתוף הציבורי (anon, בלי
 * profile מחובר) - כל עוד ENFORCE_QUOTA כבוי, זו קריאה טהורה בלי תלות ב-DB.
 */
export function canUseAvailabilityInput(): boolean {
  return !ENFORCE_QUOTA;
}

/**
 * הזמנת מנהל נוסף לארגון - פיצ'ר Pro (מועמד). כמו canUseAvailabilityInput -
 * קריאה טהורה בלי plan: כל עוד ENFORCE_QUOTA כבוי, פתוח לכולם. נקודת האכיפה
 * העתידית: כפתור "הזמנת מנהל" (מנהלים שכבר הצטרפו לא ננעלים).
 */
export function canUseAdditionalAdmins(): boolean {
  return !ENFORCE_QUOTA;
}

/**
 * דיווח היעדרויות/מחלה ע"י העובד דרך הקישור האישי - פיצ'ר Pro. כמו
 * canUseAvailabilityInput: קריאה טהורה בלי plan (נקראת מעמוד השיתוף הציבורי).
 */
export function canUseAbsenceReporting(): boolean {
  return !ENFORCE_QUOTA;
}
