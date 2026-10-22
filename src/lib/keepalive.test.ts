import { describe, it, expect, vi, afterEach } from "vitest";
// הקובץ עצמו יושב ב-api/ כי שם Vercel מחפש פונקציות - והבדיקה כאן, כי כל קובץ
// ב-api/ (גם .test.ts) היה הופך לפונקציה ציבורית.
import { GET } from "../../api/keepalive";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubEnv() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
}

describe("keepalive", () => {
  it("שואל טבלה דרך REST - כדי שהבקשה תגיע עד Postgres", async () => {
    stubEnv();
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/organizations?select=id&limit=1");
    expect(init.headers.apikey).toBe("anon-key");
  });

  // סטטוס שאינו 200 הוא מה שיופיע כשגיאה ביומני Vercel - בלי זה פרויקט מושהה
  // נראה כמו cron שרץ בהצלחה.
  it("שרת שלא עונה - 502", async () => {
    stubEnv();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await GET()).status).toBe(502);
  });

  it("שגיאה מ-Supabase - 502", async () => {
    stubEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    expect((await GET()).status).toBe(502);
  });

  it("חסרים משתני-סביבה - 500, בלי לנסות לשלוח", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await GET()).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
