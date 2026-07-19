import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_NAME = "מחלק עבודה שבועי";

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
    const payload = await req.json();
    const record = payload.record as { org_id: string; employee_id: string; date: string };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // מנהלי הארגון (כל מי שיש לו profile בארגון) + מייליהם
    const { data: admins, error: adminsError } = await supabase
      .from("profiles").select("email").eq("org_id", record.org_id);
    if (adminsError) console.error("שליפת מנהלי הארגון נכשלה:", adminsError);
    const recipients = (admins ?? []).map(a => a.email).filter((e): e is string => !!e);
    if (recipients.length === 0) return new Response("no recipients", { status: 200 });

    // שם העובד מתוך app_store (key employees)
    const { data: empRow, error: empError } = await supabase
      .from("app_store").select("value").eq("org_id", record.org_id).eq("key", "employees").maybeSingle();
    if (empError) console.error("שליפת רשימת העובדים נכשלה:", empError);
    const employees = (empRow?.value as { id: string; name: string }[] | null) ?? [];
    const empName = employees.find(e => e.id === record.employee_id)?.name ?? "עובד";

    const dateLabel = new Date(record.date + "T00:00:00Z").toLocaleDateString("he-IL", {
      weekday: "long", day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Work Allocator <onboarding@resend.dev>",
        to: recipients,
        subject: `דיווח היעדרות: ${empName.slice(0, 100)}`,
        html: `
          <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#dc2626;margin-top:0">דיווח היעדרות</h2>
            <p style="font-size:15px">${escapeHtml(empName.slice(0, 100))} דיווח/ה על היעדרות ל<strong>${escapeHtml(dateLabel)}</strong>.</p>
            <p style="font-size:13px;color:#64748b">היכנסו למערכת כדי לסדר החלפה - המשבצת מסומנת "דורש החלפה".</p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin:0">${APP_NAME} - התראה אוטומטית</p>
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
