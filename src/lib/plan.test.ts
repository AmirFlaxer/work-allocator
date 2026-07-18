import { describe, it, expect } from "vitest";
import {
  ENFORCE_QUOTA, FREE_EMPLOYEE_LIMIT, FREE_STATION_LIMIT,
  isOverEmployeeQuota, isOverStationQuota,
  canUseMultiSlotStations, canUseMonthlyReports, canUseAvailabilityInput,
  canUseAdditionalAdmins,
} from "@/lib/plan";

describe("plan gates", () => {
  it("המתג רדום כברירת מחדל - שינוי שלו הוא החלטת הפעלה מודעת", () => {
    expect(ENFORCE_QUOTA).toBe(false);
  });

  it("כשהמתג כבוי הכל מותר, גם הרחק מעבר למכסות", () => {
    expect(isOverEmployeeQuota("free", FREE_EMPLOYEE_LIMIT + 50)).toBe(false);
    expect(isOverStationQuota("free", FREE_STATION_LIMIT + 50)).toBe(false);
    expect(canUseMultiSlotStations("free")).toBe(true);
    expect(canUseMonthlyReports("free")).toBe(true);
  });

  it("תוכנית pro לעולם אינה מוגבלת, בלי תלות במתג", () => {
    expect(isOverEmployeeQuota("pro", 1000)).toBe(false);
    expect(isOverStationQuota("pro", 1000)).toBe(false);
  });

  it("הזנת זמינות ע\"י העובד - מותרת כשהמתג כבוי, בלי תלות ב-plan", () => {
    expect(canUseAvailabilityInput()).toBe(true);
  });

  it("הזמנת מנהל נוסף - מותרת כשהמתג כבוי", () => {
    expect(canUseAdditionalAdmins()).toBe(true);
  });
});
