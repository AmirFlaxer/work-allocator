import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OWNER_EMAIL    = "benqueman@gmail.com";
const APP_NAME       = "מחלק עבודה שבועי";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { senderName, senderEmail, message } = await req.json() as {
      senderName: string;
      senderEmail: string;
      message: string;
    };

    if (!message?.trim()) {
      return new Response("message required", { status: 400, headers: CORS });
    }

    const sentAt = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Work Allocator <onboarding@resend.dev>`,
        to: OWNER_EMAIL,
        reply_to: senderEmail || undefined,
        subject: `פנייה מ-${APP_NAME}: ${senderName || senderEmail || "משתמש"}`,
        html: `
          <div dir="rtl" style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#0f766e;margin-top:0">📬 פנייה חדשה מהאפליקציה</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#64748b;width:80px">שם</td><td style="padding:6px 0;font-weight:600">${senderName || "—"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">מייל</td><td style="padding:6px 0">${senderEmail || "—"}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">נשלח</td><td style="padding:6px 0;color:#94a3b8;font-size:13px">${sentAt}</td></tr>
            </table>
            <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0"/>
            <div style="background:#f8fafc;border-radius:8px;padding:16px;white-space:pre-wrap;line-height:1.6">${message}</div>
            <p style="font-size:12px;color:#94a3b8;margin-top:16px;margin-bottom:0">${APP_NAME} — פנייה ממשתמש</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(err, { status: 500, headers: CORS });
    }

    return new Response("ok", { status: 200, headers: CORS });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500, headers: CORS });
  }
});
