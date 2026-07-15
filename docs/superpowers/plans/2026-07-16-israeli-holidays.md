# חגים ישראליים אוטומטיים בטבלת השיבוץ - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** עמודת-הכותרת של כל יום בטבלת-השיבוץ מציגה רקע-גוון ושם-חג כשהיום חג/מועד ישראלי - חזק (יום-עבודה מבוטל) או עדין (מועד-קל/ערב-חג/חול-המועד) - בלי דיאלוגים, שקוף לחלוטין.

**Architecture:** מודול `src/lib/holidays.ts` עוטף את `@hebcal/core` (ייבוא דינמי, lazy-chunk) ומספק פונקציית-סיווג טהורה + פונקציה אסינכרונית `getHolidayForDate`. Hook חדש `src/hooks/use-week-holidays.ts` טוען חגים לכל השבוע. `ScheduleTable.tsx` מציג את התוצאה בעמודות-הכותרת הקיימות.

**Tech Stack:** TypeScript, Vitest, `@hebcal/core` (npm, חדש).

## Global Constraints

- TypeScript strict מופעל - כל שינוי חייב לעבור `npx tsc -p tsconfig.app.json --noEmit` נקי.
- תאריכי מפתח (YYYY-MM-DD) נוצרים ונקראים רק דרך `toISODateLocal`/`parseISODate`/`getWeekDays` מ-`src/lib/week.ts` - לעולם לא `toISOString().split("T")` ולא `new Date("YYYY-MM-DD")`.
- `@hebcal/core` נטען אך ורק דרך `import()` דינמי בתוך פונקציה - לא ייבוא סטטי בראש שום קובץ - כדי שייכנס ל-chunk נפרד ולא יתפח את ה-bundle הראשי.
- צבעים דרך tokens של הערכה (`bg-warning/NN`, `text-warning-foreground`, `text-muted-foreground`) - אף צבע קשיח בלי dark. ה-token `warning` כבר מוגדר ל-light ול-dark ב-`src/index.css:36-37,76-77`.
- אין דיאלוג-אזהרה/חסימה - רק סימון ויזואלי בעמודת-הכותרת.
- הודעות commit: כל commit מסתיים ב-`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: מודול `src/lib/holidays.ts` - סיווג וטעינת חגים

**Files:**
- Create: `src/lib/holidays.ts`
- Test: `src/lib/holidays.test.ts`
- Modify: `package.json` (הוספת תלות `@hebcal/core`)

**Interfaces:**
- Produces: `export type HolidayCategory = "strong" | "light"`, `export interface HolidayInfo { name: string; category: HolidayCategory; }`, `export function categorizeHolidayEvent(ev: { getFlags(): number; basename(): string }): HolidayCategory | null`, `export async function getHolidayForDate(dateISO: string): Promise<HolidayInfo | null>`. משימות 2-3 סומכות על השמות והחתימות האלה.

- [ ] **Step 1: התקנת החבילה**

```bash
npm install @hebcal/core
```

- [ ] **Step 2: כתיבת הבדיקות הכושלות**

צור `src/lib/holidays.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categorizeHolidayEvent, getHolidayForDate } from "@/lib/holidays";
import { toISODateLocal } from "@/lib/week";

const mockEvent = (flagsValue: number, name = "Event") => ({
  getFlags: () => flagsValue,
  basename: () => name,
});

describe("categorizeHolidayEvent", () => {
  it("CHAG הופך לקטגוריה 'strong'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x1, "Rosh Hashana"))).toBe("strong");
  });

  it("יום העצמאות הוא מקרה-פרטי - MODERN_HOLIDAY אבל 'strong'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x2000, "Yom HaAtzmaut"))).toBe("strong");
  });

  it("MODERN_HOLIDAY אחר (למשל יום הזיכרון) הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x2000, "Yom HaZikaron"))).toBe("light");
  });

  it("MINOR_HOLIDAY הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x80000, "Tu BiShvat"))).toBe("light");
  });

  it("EREV הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x100000, "Erev Rosh Hashana"))).toBe("light");
  });

  it("CHOL_HAMOED הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x200000, "Chol ha-Moed Pesach"))).toBe("light");
  });

  it("MAJOR_FAST הוא 'light' (תשעה-באב; יום-כיפור כבר מכוסה תחת CHAG)", () => {
    expect(categorizeHolidayEvent(mockEvent(0x4000, "Tish'a B'Av"))).toBe("light");
  });

  it("MINOR_FAST הוא 'light'", () => {
    expect(categorizeHolidayEvent(mockEvent(0x100, "Tzom Gedaliah"))).toBe("light");
  });

  it("אירוע בלי אף דגל רלוונטי (למשל Rosh Chodesh לבדו) מוחזר null", () => {
    expect(categorizeHolidayEvent(mockEvent(0x80, "Rosh Chodesh Nisan"))).toBeNull();
  });
});

describe("getHolidayForDate", () => {
  it("ראש-השנה (1 תשרי) מוחזר כ-strong", async () => {
    const { HDate, months } = await import("@hebcal/core");
    const iso = toISODateLocal(new HDate(1, months.TISHREI, 5787).greg());
    const result = await getHolidayForDate(iso);
    expect(result?.category).toBe("strong");
  });

  it("יום-כיפור (10 תשרי) מוחזר כ-strong", async () => {
    const { HDate, months } = await import("@hebcal/core");
    const iso = toISODateLocal(new HDate(10, months.TISHREI, 5787).greg());
    const result = await getHolidayForDate(iso);
    expect(result?.category).toBe("strong");
  });

  it("יום-חול רגיל (חשוון - החודש היחיד בלוח העברי בלי אף חג) מוחזר null", async () => {
    const { HDate, months } = await import("@hebcal/core");
    const roshHashana = new HDate(1, months.TISHREI, 5787).greg();
    const midCheshvan = new Date(roshHashana);
    midCheshvan.setDate(midCheshvan.getDate() + 40);
    const result = await getHolidayForDate(toISODateLocal(midCheshvan));
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: הרצת הבדיקות לוודא כשל**

Run: `npx vitest run src/lib/holidays.test.ts`
Expected: FAIL - `Cannot find module '@/lib/holidays'` (הקובץ עוד לא קיים).

- [ ] **Step 4: מימוש המודול**

צור `src/lib/holidays.ts`:

```ts
import { parseISODate } from "@/lib/week";

export type HolidayCategory = "strong" | "light";
export interface HolidayInfo { name: string; category: HolidayCategory; }

interface CategorizableEvent {
  getFlags(): number;
  basename(): string;
}

// ערכי הביטים מתוך @hebcal/core (מתועדים, לא מספרי-קסם):
// CHAG=0x1 (יום-טוב, ללא עבודה) · MODERN_HOLIDAY=0x2000 (יום-העצמאות/הזיכרון/השואה/ירושלים)
// MAJOR_FAST=0x4000 (יום-כיפור - כבר מכוסה ע"י CHAG - ותשעה-באב) · MINOR_HOLIDAY=0x80000
// EREV=0x100000 (ערב-חג) · CHOL_HAMOED=0x200000 · MINOR_FAST=0x100
const CHAG = 0x1;
const MODERN_HOLIDAY = 0x2000;
const LIGHT_MASK = 0x80000 /* MINOR_HOLIDAY */ | 0x100000 /* EREV */ | 0x200000 /* CHOL_HAMOED */
  | 0x4000 /* MAJOR_FAST */ | 0x100 /* MINOR_FAST */ | MODERN_HOLIDAY;

// יום-העצמאות אינו מסומן CHAG ב-hebcal (הוא MODERN_HOLIDAY, כמו יום-הזיכרון/השואה/ירושלים
// שהם ימי-עבודה רגילים) - זה מקרה-פרטי-ידני, כי בפועל הוא יום-חופש לאומי.
export function categorizeHolidayEvent(ev: CategorizableEvent): HolidayCategory | null {
  const f = ev.getFlags();
  if ((f & CHAG) !== 0 || ev.basename() === "Yom HaAtzmaut") return "strong";
  if ((f & LIGHT_MASK) !== 0) return "light";
  return null;
}

export async function getHolidayForDate(dateISO: string): Promise<HolidayInfo | null> {
  const { HebrewCalendar } = await import("@hebcal/core");
  const events = HebrewCalendar.getHolidaysOnDate(parseISODate(dateISO), true) ?? [];
  const categorized = events
    .map(ev => ({ ev, category: categorizeHolidayEvent(ev) }))
    .filter((x): x is { ev: (typeof events)[number]; category: HolidayCategory } => x.category !== null);
  if (categorized.length === 0) return null;
  const chosen = categorized.find(x => x.category === "strong") ?? categorized[0];
  return { name: chosen.ev.render("he"), category: chosen.category };
}
```

- [ ] **Step 5: הרצת הבדיקות לוודא הצלחה**

Run: `npx vitest run src/lib/holidays.test.ts`
Expected: PASS - כל 12 הבדיקות.

- [ ] **Step 6: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: הכל ירוק (כולל שאר הבדיקות הקיימות בפרויקט, ללא שינוי בהן).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/holidays.ts src/lib/holidays.test.ts
git commit -m "$(cat <<'EOF'
feat: מודול חגים ישראליים - סיווג וטעינה מ-@hebcal/core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `useWeekHolidays` - Hook לטעינת חגי השבוע

**Files:**
- Create: `src/hooks/use-week-holidays.ts`

**Interfaces:**
- Consumes: `getHolidayForDate(dateISO: string): Promise<HolidayInfo | null>`, `HolidayInfo` מ-Task 1 (`@/lib/holidays`).
- Produces: `export function useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null>`. משימה 3 סומכת על השם והחתימה הזו.

אין בדיקת-unit למשימה זו (עקבי עם מוסכמת הפרויקט - `src/hooks/` הקיים ריק מבדיקות-unit; ה-hook עצמו נבדק ויזואלית במשימה 3).

- [ ] **Step 1: מימוש ה-hook**

צור `src/hooks/use-week-holidays.ts`:

```ts
import { useEffect, useState } from "react";
import { getHolidayForDate, HolidayInfo } from "@/lib/holidays";

// טוען מידע-חג לכל ימי השבוע הנוכחיים, אסינכרונית (כי @hebcal/core נטען דינמית).
// לפני שהטעינה מסתיימת מוחזרת מפה ריקה - אין מצב-טעינה נראה בטבלה.
export function useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null> {
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo | null>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(weekDays.map(async date => [date, await getHolidayForDate(date)] as const))
      .then(entries => {
        if (!cancelled) setHolidays(Object.fromEntries(entries));
      });
    return () => { cancelled = true; };
  }, [weekDays.join(",")]);

  return holidays;
}
```

- [ ] **Step 2: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: הכל ירוק. שים לב: `eslint-plugin-react-hooks` עשוי להתריע על תלות `weekDays.join(",")` ברשימת-התלויות של `useEffect` (התבנית `[weekDays.join(",")]` נפוצה למניעת re-render על השוואת-מערך-שטחית, אבל ה-linter מצפה למערך עצמו) - אם מופיעה אזהרה חדשה, זו אזהרה תקינה וידועה לתבנית הזו, לא לתקן על ידי הוספת `weekDays` הגולמי (שיגרום ל-effect לרוץ בכל רינדור כי `getWeekDays` מחזירה מערך חדש בכל פעם).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-week-holidays.ts
git commit -m "$(cat <<'EOF'
feat: useWeekHolidays - hook לטעינת חגי השבוע לטבלת השיבוץ

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: תצוגה ב-`ScheduleTable.tsx`

**Files:**
- Modify: `src/components/ScheduleTable.tsx:14, 46-47, 122-138`

**Interfaces:**
- Consumes: `useWeekHolidays(weekDays: string[]): Record<string, HolidayInfo | null>` מ-Task 2.

- [ ] **Step 1: הוספת ה-import וקריאת ה-hook**

ב-`src/components/ScheduleTable.tsx`, שורה 14, מצא:

```ts
import { getWeekDays, getHebrewDayLabels, cellNames, stationSlots, cellKey, parseISODate } from "@/lib/week";
```

הוסף מיד אחריה שורה חדשה:

```ts
import { useWeekHolidays } from "@/hooks/use-week-holidays";
```

שורות 46-47, מצא:

```ts
  const weekDays = getWeekDays(weekStart, activeDays);
  const hebrewDays = getHebrewDayLabels(activeDays);
```

והוסף מיד אחריהן:

```ts
  const holidays = useWeekHolidays(weekDays);
```

- [ ] **Step 2: עדכון עמודת-הכותרת**

שורות 122-138, מצא:

```tsx
                {weekDays.map((date, idx) => (
                  <TableHead
                    key={date}
                    className="text-center font-semibold min-w-[150px] py-3"
                    style={{ borderBottomColor: 'hsl(var(--border-strong))' }}
                  >
                    <div className="text-sm font-bold text-foreground">{hebrewDays[idx]}</div>
                    <div className="text-xs font-normal text-muted-foreground mt-0.5">
                      {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                    </div>
                    {emptyPerDay[idx] > 0 ? (
                      <div className="text-xs text-orange-500 font-medium mt-0.5">⚠ {emptyPerDay[idx]} ריקות</div>
                    ) : (
                      <div className="text-xs text-emerald-500 font-medium mt-0.5">✓ מלא</div>
                    )}
                  </TableHead>
                ))}
```

והחלף ב:

```tsx
                {weekDays.map((date, idx) => {
                  const holiday = holidays[date];
                  const holidayBg = holiday?.category === "strong" ? "bg-warning/20"
                    : holiday?.category === "light" ? "bg-warning/8" : "";
                  return (
                    <TableHead
                      key={date}
                      className={`text-center font-semibold min-w-[150px] py-3 ${holidayBg}`}
                      style={{ borderBottomColor: 'hsl(var(--border-strong))' }}
                    >
                      <div className="text-sm font-bold text-foreground">{hebrewDays[idx]}</div>
                      <div className="text-xs font-normal text-muted-foreground mt-0.5">
                        {parseISODate(date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      </div>
                      {holiday && (
                        <div className={`text-xs mt-0.5 ${holiday.category === "strong" ? "text-warning-foreground font-semibold" : "text-muted-foreground"}`}>
                          {holiday.name}
                        </div>
                      )}
                      {emptyPerDay[idx] > 0 ? (
                        <div className="text-xs text-orange-500 font-medium mt-0.5">⚠ {emptyPerDay[idx]} ריקות</div>
                      ) : (
                        <div className="text-xs text-emerald-500 font-medium mt-0.5">✓ מלא</div>
                      )}
                    </TableHead>
                  );
                })}
```

- [ ] **Step 3: אימות מלא**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm run build`
Expected: הכל ירוק, ללא אזהרות lint חדשות (חוץ מהאזהרה הידועה על `useEffect` deps מ-Task 2, אם הופיעה).

- [ ] **Step 4: אימות ש-@hebcal/core לא נכנס ל-bundle הראשי**

Run: `grep -l "hebcal" dist/assets/index-*.js`
Expected: אין תוצאה (exit code 1 / "no matches") - `@hebcal/core` חייב להופיע רק ב-chunk נפרד, לא ב-bundle הראשי `index-*.js`. אם יש תוצאה - ה-import הדינמי לא בודד כראוי; לבדוק ש-`import("@hebcal/core")` ב-`src/lib/holidays.ts` הוא אכן `import()` דינמי (לא סטטי) ושאין ייבוא סטטי נוסף שלו בשום קובץ אחר.

- [ ] **Step 5: אימות ויזואלי-ידני**

אין בדיקת-unit לרינדור הזה (עקבי עם מוסכמת הפרויקט - קומפוננטות לא נבדקות ב-unit). להריץ `npm run dev`, לפתוח את האפליקציה, ולנווט לשבוע שמכיל חג-חזק (למשל השבוע של ראש-השנה) ולשבוע עם מועד-עדין (למשל שבוע עם ערב-חג או חול-המועד) - לוודא שהרקע והשם מופיעים נכון בשני המקרים, ושבשבוע-חול רגיל אין שינוי בתצוגה. לתעד בדוח המשימה מה נבדק (התאריכים, מה נראה) - צילום-מסך אם אפשר.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScheduleTable.tsx
git commit -m "$(cat <<'EOF'
feat: תצוגת חגים בעמודת-הכותרת של טבלת השיבוץ

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
