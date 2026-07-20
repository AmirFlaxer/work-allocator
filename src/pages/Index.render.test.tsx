// @vitest-environment happy-dom
//
// בדיקת עשן (smoke test): מוודאת ש-<Index /> עולה בלי לזרוק שגיאה, בשני מצבי
// isSupabaseConfigured (false/true). קיימת כי תקלת TDZ אמיתית (useCallback
// שהוגדר אחרי effects שהצביעו עליו ב-deps) הגיעה לפרודקשן למרות ש-tsc, כל
// 98 בדיקות היחידה, וה-build של Vite עברו - אף אחד מהם לא מריץ את עץ
// הקומפוננטות בפועל. הבדיקה הזו במכוון מינימלית: רק "עולה בלי לקרוס", בלי
// אסרציות על תוכן מוצג, אינטראקציה, או snapshot. אל תרחיבו אותה לבדיקה
// התנהגותית - זה יהפוך אותה לבדיקה שצריך לעדכן בכל פיצ'ר עתידי ותיזנח.

import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// נדרש כדי ש-React.act יסכים לעבוד מחוץ ל-testing-library
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Polyfills ל-happy-dom (חסרות/שבורות ב-happy-dom, קומפוננטות ה-UI/hooks נשענות עליהן) ──
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("ResizeObserver", vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })));
  vi.stubGlobal("IntersectionObserver", vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  })));
  // happy-dom's built-in localStorage נזרקת ללא --localstorage-file - פוליפיל פשוט במקומה.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/lib/supabase");
  vi.doUnmock("@/contexts/AuthContext");
  vi.doUnmock("@/hooks/use-toast");
});

// ── Mocks משותפים ────────────────────────────────────────────────────────
const mockAuth = () => {
  vi.doMock("@/contexts/AuthContext", () => ({
    useAuth: () => ({
      user: null,
      profile: null,
      org: null,
      loading: false,
      profileMissing: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      completeRegistration: vi.fn(),
      acceptInvite: vi.fn(),
      signUpAndJoin: vi.fn(),
      signOut: vi.fn(),
    }),
  }));
};

const mockToast = () => {
  vi.doMock("@/hooks/use-toast", () => ({
    useToast: () => ({ toasts: [], toast: vi.fn(), dismiss: vi.fn() }),
    toast: vi.fn(),
  }));
};

async function mountIndex(isSupabaseConfigured: boolean) {
  vi.resetModules();
  mockAuth();
  mockToast();
  vi.doMock("@/lib/supabase", () => ({
    supabase: isSupabaseConfigured ? {} : null,
    isSupabaseConfigured,
  }));

  const { default: Index } = await import("@/pages/Index");

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<Index />);
  });
  return { container, root };
}

function unmountIndex(container: HTMLDivElement, root: Root) {
  act(() => { root.unmount(); });
  container.remove();
}

describe("<Index /> - בדיקת עשן", () => {
  it("עולה בלי לזרוק שגיאה כש-isSupabaseConfigured=false", async () => {
    const { container, root } = await mountIndex(false);
    unmountIndex(container, root);
  });

  it("עולה בלי לזרוק שגיאה כש-isSupabaseConfigured=true", async () => {
    const { container, root } = await mountIndex(true);
    unmountIndex(container, root);
  });
});
