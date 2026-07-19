// ════════════════════════════════════════════════════════
// ⚠️ מצב: בנוי ונבדק, אך עדיין לא מופעל במלואו
//
// היכולת הזו נפרסה ונבדקה מקצה-לקצה, אבל המיילים מגיעים כרגע רק לכתובת
// בעל-החשבון: שליחה לנמענים שרירותיים מחייבת דומיין-שולח מאומת ב-Resend,
// ואנחנו עדיין שולחים מכתובת-החול onboarding@resend.dev.
//
// ההפעלה המלאה נדחתה משיקולי תקציב (רכישת דומיין ותוכנית-דואר בתשלום)
// ואבטחת-מידע (שליטה במה שיוצא מהמערכת והגנה על כתובות הלקוחות),
// ומתוכננת לעתיד הקרוב.
//
// להפעלה: לאמת דומיין ב-Resend, להחליף את כתובת ה-from למטה, ולבדוק מחדש.
// אין כאן תקלה - זו התנהגות מכוונת.
// ════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_NAME = "מחלק עבודה שבועי";
const APP_URL  = "https://work-allocator.vercel.app";

// קלט משתמש משורבב ל-HTML - חובה להבריח.
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

serve(async (req) => {
  try {
    const { org_id } = await req.json() as { org_id: string };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: admins, error: adminsError } = await supabase
      .from("profiles").select("email").eq("org_id", org_id);
    if (adminsError) console.error("שליפת מנהלי הארגון נכשלה:", adminsError);
    const recipients = (admins ?? []).map(a => a.email).filter((e): e is string => !!e);
    if (recipients.length === 0) return new Response("no recipients", { status: 200 });

    const { data: org, error: orgError } = await supabase
      .from("organizations").select("name").eq("id", org_id).maybeSingle();
    if (orgError) console.error("שליפת שם הארגון נכשלה:", orgError);
    const orgName = org?.name ?? "הארגון";

    // טווח השבוע הקרוב לתצוגה בלבד (ההחלטה אם לשלוח כבר התקבלה ב-SQL)
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const sunday = new Date(today);
    sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7));
    const thursday = new Date(sunday);
    thursday.setDate(thursday.getDate() + 4);
    const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    const range = `${fmt(sunday)}-${fmt(thursday)}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Work Allocator <onboarding@resend.dev>",
        to: recipients,
        subject: `תזכורת: השיבוץ לשבוע הבא טרם פורסם`,
        html: `
          <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#0e6c64;margin-top:0">תזכורת שבועית</h2>
            <p style="font-size:15px">השיבוץ לשבוע הבא (<strong>${escapeHtml(range)}</strong>) של ${escapeHtml(orgName.slice(0, 100))} עדיין לא פורסם לצוות.</p>
            <p style="margin:24px 0">
              <a href="${APP_URL}/?week=next" style="background:#0e6c64;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">פתח את השבוע הבא</a>
            </p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin:0">${APP_NAME} - תזכורת אוטומטית</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(err, { status: 500 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
