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

REVOKE EXECUTE ON FUNCTION upcoming_sunday() FROM PUBLIC, anon, authenticated;

-- בוחרת את הארגונים שטרם פרסמו את השבוע הקרוב ושולחת לכל אחד קריאה ל-Edge Function.
-- נשלח לארגון שה-weekStart המפורסם שלו קודם ליום ראשון הקרוב (או שאין לו פרסום כלל).
-- ארגון שפרסם את השבוע הקרוב או מעבר לו לא ייבחר, ולכן לא ינודנד.
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

-- הפונקציה נקראת מה-cron בלבד. בלי REVOKE היא הייתה נגישה דרך PostgREST לכל
-- קורא anon/authenticated (ברירת-המחדל של Postgres היא EXECUTE ל-PUBLIC),
-- ומאפשרת לכל אחד להפעיל מבול תזכורות לכל הארגונים.
REVOKE EXECUTE ON FUNCTION send_schedule_reminders() FROM PUBLIC, anon, authenticated;

-- הג'וב: כל יום חמישי ב-06:00 UTC = 09:00 שעון ישראל בקיץ, 08:00 בחורף.
-- unschedule לפני schedule כדי שהחלה חוזרת לא תיצור כפילות.
SELECT cron.unschedule('weekly-schedule-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-schedule-reminder');

SELECT cron.schedule(
  'weekly-schedule-reminder',
  '0 6 * * 4',
  $cron$ SELECT send_schedule_reminders(); $cron$
);
