// Supabase Free משהה פרויקט אחרי שבוע בלי פעילות - כך האפליקציה נפלה ב-22/10/2026
// אחרי שלושה חודשים בלי שימוש, וכל ניסיון כניסה הציג "סיסמה שגויה". Vercel Cron
// קורא לכאן פעם ביום (vercel.json), והשאילתה מגיעה עד Postgres ונספרת כפעילות.
//
// למה לא GitHub Actions: הריפו ציבורי, ו-GitHub מכבה workflow מתוזמן אחרי 60 יום
// בלי פעילות בריפו - בדיוק התרחיש שהשעון הזה אמור לכסות.
//
// אין כאן סוד: המפתח הציבורי ממילא נשלח לכל דפדפן שטוען את האפליקציה, ו-RLS
// מחזיר לאנונימי רשימה ריקה.
export async function GET(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing Supabase env" }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
      headers: { apikey: key },
    });
    return Response.json({ ok: res.ok, supabaseStatus: res.status }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
