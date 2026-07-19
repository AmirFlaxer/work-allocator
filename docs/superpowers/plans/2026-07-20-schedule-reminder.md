# תזכורת שבועית להכנת השיבוץ - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** כל יום חמישי, ארגון שטרם פרסם את השיבוץ לשבוע הקרוב מקבל מייל תזכורת עם קישור שפותח את האפליקציה על השבוע הבא.

**Architecture:** `pg_cron` מריץ פונקציית SQL שבוחרת את הארגונים הזקוקים לתזכורת (ההחלטה מתקבלת ב-SQL) וקוראת ל-Edge Function `notify-schedule-reminder` פר ארגון דרך `pg_net`. ה-Function היא "שליח טיפש" - מקבלת org_id ושולחת מייל. אלגוריתם השיבוץ נשאר בדפדפן בלבד.

**Tech Stack:** Supabase (pg_cron + pg_net + Edge Functions + Resend) · React 18 + TS · vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-schedule-reminder-design.md`

## סטייה מודעת מה-spec (החלטת המתכנן, לידיעת הסוקרים)

ה-spec ביקש "vitest ללוגיקה הטהורה: חישוב יום-ראשון-הקרוב והכרעת לדלג-או-לשלוח".
**הכרעת ההחלטה עברה ל-SQL במקום ל-TypeScript**, מהסיבה הבאה: ה-Edge Function רצה
ב-Deno ואינה יכולה לייבא מ-`src/lib`. אילו היינו כותבים את הלוגיקה ב-`src/lib` עם
בדיקות vitest, היה צורך **לשכפל אותה** ל-Deno - כלומר בדיקות שמאמתות עותק שאינו זה
שרץ בפועל. זה גרוע מאי-בדיקה, כי הוא נותן ביטחון-שווא.

לכן: ההחלטה נמצאת ב-SQL (מקור יחיד), ומאומתת בבדיקת-עשן על ה-DB החי שמכסה את
ארבעת המקרים שה-spec מנה (פורסם-בדיוק / פורסם-קדימה / לא-פורסם / אין-פרסום-כלל).
**vitest כן נכתב** ללוגיקה הטהורה שבאמת חיה ב-frontend: קריאת הפרמטר `?week=next`.

## Global Constraints

- **עברית בלבד** בכל UI/הערות/מיילים. מקף רגיל ( - ), בלי חצים (→).
- **branch:** `feat/schedule-reminder` בתיקיית הפרויקט הראשית. כל משימה נפתחת ב-`git branch --show-current` - עצור אם לא תואם.
- שערים: `npx tsc --noEmit && npm test && npm run lint` (baseline 8 אזהרות, בלי חדשות). משימות UI גם `npm run build`.
- קובצי SQL ו-Edge Functions הם מקור-אמת בלבד; ההחלה/פריסה היא משימת-אינטגרציה (Task 5) של המתזמר.
- **אפס שינוי התנהגות כשאין פרמטר `?week=next`.**

---

### Task 1: SQL - pg_cron, פונקציית הבחירה, והג'וב

**Files:**
- Create: `supabase_reminders.sql`

**Interfaces:**
- Produces (למשימה 2): קריאת HTTP ל-`notify-schedule-reminder` עם גוף `{"org_id": "<id>"}`.

- [ ] **Step 1: כתיבת הקובץ במלואו**

```sql
-- ════════════════════════════════════════════════════════
-- Schedule Reminders - תזכורת שבועית להכנת השיבוץ (spec: 2026-07-20)
-- מקור-אמת. מוחל על ה-DB דרך Supabase MCP (apply_migration), לא ידנית.
-- דורש: organizations, published_schedules (כבר רצים בפרודקשן).
-- ════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- יום ראשון הקרוב (כולל היום אם היום ראשון), בשעון ישראל.
-- אותו חישוב כמו getNextSunday בצד הלקוח: היום + ((7 - DOW) % 7).
CREATE OR REPLACE FUNCTION upcoming_sunday()
RETURNS TEXT LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT to_char(
    d + ((7 - EXTRACT(DOW FROM d)::int) % 7),
    'YYYY-MM-DD')
  FROM (SELECT (NOW() AT TIME ZONE 'Asia/Jerusalem')::date AS d) s;
$$;

-- בוחרת את הארגונים שטרם פרסמו את השבוע הקרוב ושולחת לכל אחד קריאה ל-Edge Function.
-- ההשוואה היא >= : ארגון שפרסם שבועיים קדימה לא ינודנד.
-- ארגון בלי פרסום כלל (LEFT JOIN -> NULL) כן מקבל תזכורת.
CREATE OR REPLACE FUNCTION send_schedule_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_upcoming TEXT := upcoming_sunday();
  v_org      RECORD;
  v_count    INT := 0;
BEGIN
  FOR v_org IN
    SELECT o.id
    FROM organizations o
    LEFT JOIN published_schedules p ON p.org_id = o.id
    WHERE COALESCE(p.payload ->> 'weekStart', '') < v_upcoming
  LOOP
    PERFORM net.http_post(
      url     := 'https://zaffitnzxdlnwmyvmshp.supabase.co/functions/v1/notify-schedule-reminder',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('org_id', v_org.id)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- הג'וב: כל יום חמישי ב-06:00 UTC = 09:00 שעון ישראל בקיץ, 08:00 בחורף.
-- unschedule לפני schedule כדי שהחלה חוזרת לא תיצור כפילות.
SELECT cron.unschedule('weekly-schedule-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-schedule-reminder');

SELECT cron.schedule(
  'weekly-schedule-reminder',
  '0 6 * * 4',
  $cron$ SELECT send_schedule_reminders(); $cron$
);
```

- [ ] **Step 2: אימות סטטי** - `npx tsc --noEmit && npm test`. Expected: 93/93 ירוק (הקובץ לא נוגע ב-TS; בדיקת-שפיות).

- [ ] **Step 3: Commit**

```bash
git add supabase_reminders.sql
git commit -m "feat: supabase_reminders.sql - בחירת ארגונים לתזכורת + ג'וב cron שבועי"
```

---

### Task 2: Edge Function + הערות מצב-רדום בשתי הפונקציות

**Files:**
- Create: `supabase/functions/notify-schedule-reminder/index.ts`
- Modify: `supabase/functions/notify-absence/index.ts` (הערת-כניסה בלבד)

**Interfaces:**
- Consumes: גוף הבקשה `{ org_id: string }` (Task 1).

- [ ] **Step 1: יצירת `supabase/functions/notify-schedule-reminder/index.ts`**

```ts
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
```

- [ ] **Step 2: הערת-כניסה ל-`supabase/functions/notify-absence/index.ts`**

להוסיף בראש הקובץ, **לפני שורת ה-import הראשונה**, את אותו בלוק בדיוק (כולל
הכותרות בקווים) כמו ב-Step 1 - הטקסט זהה מילה במילה, כדי ששתי הפונקציות יישאו
את אותו הסבר. אין שינוי נוסף בקובץ.

- [ ] **Step 3: אימות סטטי** - `npx tsc --noEmit && npm test` (קובצי Deno מחוץ ל-tsconfig; בדיקת-שפיות שהאפליקציה לא נשברה). Expected: 93/93.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notify-schedule-reminder/index.ts supabase/functions/notify-absence/index.ts
git commit -m "feat: Edge Function notify-schedule-reminder + הערת מצב-רדום בפונקציות המייל"
```

---

### Task 3: הפרמטר `?week=next` ב-frontend (TDD)

**Files:**
- Create: `src/lib/weekParam.ts`, `src/lib/weekParam.test.ts`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Produces: `hasNextWeekParam(search: string): boolean` · `stripWeekParam(search: string): string`.

- [ ] **Step 1: בדיקות נכשלות** - `src/lib/weekParam.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasNextWeekParam, stripWeekParam } from "./weekParam";

describe("hasNextWeekParam", () => {
  it("מזהה week=next", () => {
    expect(hasNextWeekParam("?week=next")).toBe(true);
    expect(hasNextWeekParam("?foo=1&week=next")).toBe(true);
  });
  it("לא מזהה ערך אחר או היעדר פרמטר", () => {
    expect(hasNextWeekParam("?week=prev")).toBe(false);
    expect(hasNextWeekParam("?foo=1")).toBe(false);
    expect(hasNextWeekParam("")).toBe(false);
  });
});

describe("stripWeekParam", () => {
  it("מסיר את week ומשאיר את השאר", () => {
    expect(stripWeekParam("?week=next&foo=1")).toBe("?foo=1");
  });
  it("מחזיר מחרוזת ריקה כשלא נשאר כלום", () => {
    expect(stripWeekParam("?week=next")).toBe("");
  });
  it("לא נוגע כשאין week", () => {
    expect(stripWeekParam("?foo=1")).toBe("?foo=1");
  });
});
```

- [ ] **Step 2: לוודא כישלון** - `npm test -- weekParam` Expected: FAIL על import חסר.

- [ ] **Step 3: מימוש `src/lib/weekParam.ts`**

```ts
/**
 * פרמטר ?week=next - מגיע מהקישור במייל התזכורת השבועית, וגורם לאפליקציה
 * לקפוץ ליום ראשון הקרוב. לוגיקה טהורה כדי שתהיה בדיקה.
 */
export function hasNextWeekParam(search: string): boolean {
  return new URLSearchParams(search).get("week") === "next";
}

/** אותה מחרוזת בלי הפרמטר week - לניקוי ה-URL אחרי הקפיצה. */
export function stripWeekParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("week");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
```

- [ ] **Step 4: לוודא הצלחה** - `npm test -- weekParam` PASS, ואז `npx tsc --noEmit`.

- [ ] **Step 5: חיווט ב-`src/pages/Index.tsx`**

הרקע שחייבים להבין לפני העריכה: `weekStart` נטען מ-`app_store` בתוך effect
שמסתיים ב-`hasLoaded.current = true` ואז `setTimeout` שמאפס את
`isRemoteUpdate.current`. קפיצה לשבוע הבא **חייבת** לקרות אחרי איפוס זה, אחרת
היא תידרס ע"י הטעינה או לא תסונכרן.

1. import: `import { hasNextWeekParam, stripWeekParam } from "@/lib/weekParam";`
2. ref חדש ליד שאר ה-refs (ליד `hasLoaded`, ~שורה 277):

```tsx
  // ?week=next מהמייל השבועי - מיושם פעם אחת בלבד, אחרי שהטעינה הסתיימה
  const weekJumpPending = useRef(hasNextWeekParam(window.location.search));
```

3. פונקציית-עזר ליד שאר ה-handlers (למשל ליד `handleToday`, ~שורה 878):

```tsx
  // קפיצה לשבוע הבא לפי הפרמטר מהמייל, וניקוי הפרמטר מה-URL כדי שרענון לא יקפיץ שוב
  const applyPendingWeekJump = useCallback(() => {
    if (!weekJumpPending.current) return;
    weekJumpPending.current = false;
    setWeekStart(getNextSunday(new Date()));
    window.history.replaceState({}, "", window.location.pathname + stripWeekParam(window.location.search));
  }, []);
```

4. קריאה במסלול Supabase - בתוך ה-`setTimeout` של effect הטעינה (~שורה 396),
   **אחרי** `isRemoteUpdate.current = false;`:

```tsx
        applyPendingWeekJump();
```
   ולהוסיף `applyPendingWeekJump` ל-deps של אותו effect.

5. קריאה במסלול המקומי (בלי Supabase) - effect חדש שרץ פעם אחת:

```tsx
  useEffect(() => {
    if (!isSupabaseConfigured) applyPendingWeekJump();
  }, [applyPendingWeekJump]);
```

- [ ] **Step 6: שערים** - `npx tsc --noEmit && npm test && npm run lint && npm run build`. Expected: ירוק, 99 בדיקות, בלי אזהרות חדשות.

- [ ] **Step 7: Commit**

```bash
git add src/lib/weekParam.ts src/lib/weekParam.test.ts src/pages/Index.tsx
git commit -m "feat: פרמטר week=next מהמייל השבועי קופץ לשבוע הבא"
```

---

### Task 4: מדריך משתמש (md + PDF)

**Files:** Modify `public/user-guide.md`, Regenerate `public/user-guide.pdf`

- [ ] **Step 1:** לקרוא את המדריך ולהוסיף במיקום הטבעי (בפרק על לשונית השיבוץ / הפרסום):

```markdown
### תזכורת שבועית

כל יום חמישי, אם השיבוץ לשבוע הקרוב עדיין לא פורסם לצוות, נשלח מייל תזכורת למנהלי הארגון עם קישור שפותח את המערכת ישירות על השבוע הבא. אם השיבוץ כבר פורסם - לא נשלחת תזכורת.
```

- [ ] **Step 2:** יצירת PDF מחדש (התהליך המלא: `docs/superpowers/plans/2026-07-18-export-empty-slots-warning.md` Task 2 Step 2 - marked + עטיפת RTL בתיקיית scratchpad + Chrome headless), ואימות ויזואלי ב-Read.

- [ ] **Step 3: Commit** - `docs: מדריך משתמש - תזכורת שבועית`

---

### Task 5: אינטגרציה (מתזמר בלבד)

- [ ] **Step 1:** סקירת-ענף סופית (Opus - נוגע ב-cron, SECURITY DEFINER, ושליחת מייל).
- [ ] **Step 2:** החלת `supabase_reminders.sql` דרך `mcp__supabase__apply_migration`.
- [ ] **Step 3:** פריסת `notify-schedule-reminder` דרך `mcp__supabase__deploy_edge_function` (verify_jwt=false, כמו אחיותיה).
- [ ] **Step 4: בדיקת-עשן ל-4 המקרים** (`mcp__supabase__execute_sql`) - זו הבדיקה שמחליפה את ה-vitest שה-spec ביקש, ולכן חייבת לכסות את כולם. לכל מקרה: לזרוע `published_schedules` מתאים ולוודא ש-`send_schedule_reminders()` בוחר/מדלג נכון:
  - `weekStart` = בדיוק יום ראשון הקרוב - **מדלג**.
  - `weekStart` = שבוע קדימה - **מדלג**.
  - `weekStart` = שבוע שעבר - **שולח**.
  - אין שורת `published_schedules` כלל - **שולח**.
  לוודא גם ש-`upcoming_sunday()` מחזיר יום ראשון (`EXTRACT(DOW)` = 0). ניקוי מלא אחרי.
- [ ] **Step 5:** אימות שהג'וב רשום: `SELECT jobname, schedule, active FROM cron.job;`
- [ ] **Step 6:** מיזוג ff ל-main + push, פריסה ירוקה.
- [ ] **Step 7:** אימות חי: פתיחת `work-allocator.vercel.app/?week=next` ואימות שהאפליקציה נוחתת על יום ראשון הקרוב ושהפרמטר נוקה מה-URL. הרצה ידנית של `send_schedule_reminders()` ואימות בלוגים שהפונקציה נקראה. ניקוי נתוני-בדיקה. עדכון memory.

## Self-Review (בוצע בכתיבה)

- **כיסוי spec:** cron+בחירה (Task 1) · Edge Function + **הערת מצב-רדום בשתי הפונקציות** (Task 2) · `?week=next` (Task 3) · מדריך (Task 4) · החלה+עשן+חי (Task 5). הסטייה היחידה (vitest להחלטה) מתועדת בראש המסמך עם נימוק, והוחלפה בבדיקת-עשן מפורשת ל-4 המקרים.
- **עקביות:** גוף הבקשה `{org_id}` זהה בין ה-SQL (Task 1) ל-Function (Task 2); `hasNextWeekParam`/`stripWeekParam` מוגדרים ומשומשים רק ב-Task 3.
- **אין placeholders.**
- **הערת-סוקרים:** `send_schedule_reminders` היא SECURITY DEFINER וקוראת ל-`net.http_post` - היא נקראת רק מה-cron (אין GRANT ל-anon/authenticated), ולכן אינה חושפת נקודת-קצה חדשה.
