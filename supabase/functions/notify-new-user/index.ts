import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OWNER_EMAIL   = "benqueman@gmail.com";
const APP_NAME      = "מחלק עבודה שבועי";

// שם/מייל/ארגון הם קלט משתמש שמשורבב ל-HTML של המייל - חובה להבריח.
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
    const payload = await req.json();
    const record  = payload.record as {
      id: string;
      full_name: string | null;
      email: string | null;
      org_id: string;
      created_at: string | null;
    };
    const safeName  = record.full_name ? escapeHtml(record.full_name.slice(0, 200)) : null;
    const safeEmail = record.email ? escapeHtml(record.email.slice(0, 200)) : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", record.org_id)
      .single();

    const registeredAt = record.created_at
      ? new Date(record.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })
      : new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Work Allocator <onboarding@resend.dev>",
        to: OWNER_EMAIL,
        subject: `נרשם חדש ל-${APP_NAME}: ${record.full_name?.slice(0, 200) ?? record.email?.slice(0, 200)}`,
        html: `
          <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#4f46e5;margin-top:0">נרשם חדש!</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#64748b;width:90px">שם</td><td style="padding:6px 0;font-weight:600">${safeName ?? "—"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">מייל</td><td style="padding:6px 0">${safeEmail ?? "—"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">ארגון</td><td style="padding:6px 0">${org?.name ? escapeHtml(String(org.name).slice(0, 200)) : "—"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">תאריך</td><td style="padding:6px 0">${registeredAt}</td></tr>
            </table>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin:0">${APP_NAME} — התראה אוטומטית</p>
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
