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
