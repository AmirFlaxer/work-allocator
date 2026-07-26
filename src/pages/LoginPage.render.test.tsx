// @vitest-environment happy-dom
//
// בדיקת עשן למסכי ה-auth, באותה רוח (ומאותה סיבה) כמו Index.render.test.tsx:
// tsc, בדיקות-היחידה וה-build אינם מריצים את עץ הקומפוננטות, ולכן קריסת-רינדור
// עוברת דרכם. שלושת המסכים כאן נדרכים נדיר במיוחד - CompleteRegistrationPage
// רק בהרשמה שנקטעה, ו-SetNewPasswordPage רק אחרי לחיצה על קישור-שחזור, כלומר
// פעם אחת ודווקא ברגע שבו למשתמש אין דרך חלופית להיכנס. קריסה שם היא דלת נעולה.
//
// במכוון מינימלית: רק "עולה בלי לזרוק", בלי אסרציות על תוכן או אינטראקציה.
// אין להרחיב לבדיקה התנהגותית - זה יהפוך אותה לבדיקה שצריך לעדכן בכל שינוי-UI.

import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("ResizeObserver", vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/contexts/AuthContext");
  vi.doUnmock("@/hooks/use-toast");
});

async function mount(pageName: "LoginPage" | "SetNewPasswordPage" | "CompleteRegistrationPage") {
  vi.resetModules();
  vi.doMock("@/contexts/AuthContext", () => ({
    useAuth: () => ({
      user: { email: "manager@example.com" },
      profile: null, org: null, loading: false,
      profileMissing: false, recoveryMode: false,
      signIn: vi.fn(), signUp: vi.fn(), completeRegistration: vi.fn(),
      acceptInvite: vi.fn(), signUpAndJoin: vi.fn(),
      requestPasswordReset: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(),
    }),
  }));
  vi.doMock("@/hooks/use-toast", () => ({
    useToast: () => ({ toasts: [], toast: vi.fn(), dismiss: vi.fn() }),
    toast: vi.fn(),
  }));

  const mod = await import("@/pages/LoginPage");
  const Page = mod[pageName];

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<Page />);
  });
  act(() => { root.unmount(); });
  container.remove();
}

describe("מסכי auth - בדיקת עשן", () => {
  it("<LoginPage /> עולה בלי לזרוק", async () => {
    await mount("LoginPage");
  });

  it("<SetNewPasswordPage /> עולה בלי לזרוק", async () => {
    await mount("SetNewPasswordPage");
  });

  it("<CompleteRegistrationPage /> עולה בלי לזרוק", async () => {
    await mount("CompleteRegistrationPage");
  });
});
