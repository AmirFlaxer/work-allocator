# העדפות רכות ("מעדיף שלא") - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ימי "מעדיף שלא" לעובד (הזנת מנהל) שהאלגוריתם מכבד אלא אם אין ברירה, עם toggle תלת-מצבי במסך ההעדפות וסימון ענבר בטבלה.

**Architecture:** שדה `preferNotDays?: string[]` על Employee (JSON ב-app_store, בלי מיגרציה). ב-scheduler: עזר `isBlocked(emp, date, respectSoft)`; שלבים 1-6 מכבדים את ההעדפה (בקשות ספציפיות גוברות), שלבים 5-6 מחולצים לפונקציות ורצים שוב כשלבים 7-8 עם `respectSoft=false`.

**Tech Stack:** React 18 + TypeScript, vitest, shadcn/ui (Checkbox עם מצב indeterminate).

**Spec:** `docs/superpowers/specs/2026-07-19-soft-preferences-design.md`

## Global Constraints

- עברית בלבד ב-UI, מקף רגיל ( - ), בלי חצים (→).
- **branch:** `feat/soft-preferences` בתיקיית הפרויקט הראשית (לא worktree). כל משימה: `git branch --show-current`, עצור אם לא תואם.
- שערים לכל משימה: `npx tsc --noEmit && npm test && npm run lint` (בלי אזהרות חדשות מעל baseline 10). משימות UI גם `npm run build`.
- **כל 71 הבדיקות הקיימות חייבות להישאר ירוקות ללא שינוי** - זו בדיקת הרגרסיה של "התנהגות זהה כשאין preferNotDays".

---

### Task 1: טיפוס + אלגוריתם (TDD)

**Files:**
- Modify: `src/types/employee.ts` (שדה חדש ב-Employee)
- Modify: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts` (הוספת describe חדש)

**Interfaces:**
- Produces (למשימות 2-3): `Employee.preferNotDays?: string[]` (תאריכי YYYY-MM-DD).
- אין שינוי בחתימת `generateWeeklySchedule`.

- [ ] **Step 1: השדה בטיפוס**

ב-`src/types/employee.ts`, אחרי `unavailableDays?: string[];` (שורה 8):

```ts
  /** ימים שהעובד מעדיף לא לעבוד בהם - האלגוריתם נמנע אלא אם אין ברירה */
  preferNotDays?: string[];
```

- [ ] **Step 2: בדיקות נכשלות** - להוסיף ל-`src/lib/scheduler.test.ts` (describe חדש בסוף בלוק `generateWeeklySchedule` הקיים, באותו סגנון - העזרים `emp`/`st`/`namesAt`/`WEEK_START` כבר קיימים בקובץ):

```ts
  describe("העדפות רכות (מעדיף שלא)", () => {
    it("מעדיף-שלא לא משובץ כשיש עובד חלופי", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({ id: "a", name: "אבי", preferNotDays: [day] }),
        emp({ id: "b", name: "בני" }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual(["בני"]);
    });

    it("משמרת-כפולה של עובד אחר עדיפה על שבירת מעדיף-שלא", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({ id: "a", name: "אבי", preferNotDays: [day] }),
        emp({ id: "b", name: "בני", maxDailyShifts: 2 }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1), st(2)], WEEK_START, [0]);
      // שלב 6 (משמרת שנייה לבני) רץ לפני שלבים 7-8 - אבי לא משובץ בכלל
      expect(namesAt(schedule, day, 1)).toEqual(["בני"]);
      expect(namesAt(schedule, day, 2)).toEqual(["בני"]);
    });

    it("כשאין ברירה - מעדיף-שלא כן משובץ והמשבצת לא נשארת ריקה", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [emp({ id: "a", name: "אבי", preferNotDays: [day] })];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual(["אבי"]);
    });

    it("לא-זמין קשיח לא משובץ לעולם, גם כשאין ברירה", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [emp({ id: "a", name: "אבי", unavailableDays: [day] })];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      expect(namesAt(schedule, day, 1)).toEqual([""]);
    });

    it("בקשה ספציפית גוברת על מעדיף-שלא", () => {
      const [day] = getWeekDays(WEEK_START, [0]);
      const employees = [
        emp({
          id: "a", name: "אבי", hasStar: true, minWeeklyShifts: 1,
          preferNotDays: [day], specificRequests: [{ date: day, stationId: 1 }],
        }),
        emp({ id: "b", name: "בני" }),
      ];
      const schedule = generateWeeklySchedule(employees, [st(1)], WEEK_START, [0]);
      // בלי העדפת-הבקשה, אבי היה נחסם בשלבים 1-2 ובני היה תופס את המשבצת
      expect(namesAt(schedule, day, 1)).toEqual(["אבי"]);
    });
  });
```

- [ ] **Step 3: הרצה לוודא כישלון**

Run: `npm test -- scheduler`
Expected: הבדיקה הראשונה, השנייה והאחרונה נכשלות (preferNotDays עדיין לא משפיע); "אין ברירה" ו"קשיח" עוברות ממילא. גם שגיאת TS אם השדה טרם נוסף - לכן Step 1 קודם.

- [ ] **Step 4: מימוש ב-`src/lib/scheduler.ts`**

1. אחרי הגדרת `availableStationsFor` (~שורה 48) הוסף:

```ts
  // חסימת יום: "לא זמין" תמיד; "מעדיף שלא" רק כשמכבדים העדפות רכות
  // (respectSoft=false בשלבי אין-ברירה 7-8 ובבקשות ספציפיות).
  const isBlocked = (emp: Employee, date: string, respectSoft: boolean) =>
    (emp.unavailableDays?.includes(date) ?? false) ||
    (respectSoft && (emp.preferNotDays?.includes(date) ?? false));
```

2. **שלבים 1, 3 (בקשות ספציפיות): ללא שינוי** - ממשיכים לבדוק רק `unavailableDays` (הבקשה גוברת על מעדיף-שלא).

3. **שלב 2** (~שורה 115): החלף `if (employee.unavailableDays?.includes(date)) continue;` ב:

```ts
        if (isBlocked(employee, date, true)) continue;
```

4. **שלב 4** (~שורה 147): החלף `if (employee.unavailableDays?.includes(date)) continue;` ב:

```ts
      if (isBlocked(employee, date, true)) continue;
```

5. **שלבים 5-6: חילוץ לפונקציות + סבב שני.** החלף את שני הבלוקים `// Pass 5:` ו-`// Pass 6:` הקיימים (שורות ~155-189) ב:

```ts
  // שלבים 5+7: סבב מילוי למשבצות ריקות (משמרת ראשונה ביום, לא-מכוכבים).
  // respectSoft=true מכבד "מעדיף שלא"; false = סבב אין-ברירה.
  const runFillPass = (respectSoft: boolean) => {
    weekDays.forEach(date => {
      stations.forEach(station => {
        while (freeSlot(date, station.id) >= 0) {
          const candidate = leastLoaded(employees.filter(emp =>
            !emp.hasStar &&
            availableStationsFor(emp).includes(station.id) &&
            !employeeAssignments[emp.id][date] &&
            !isBlocked(emp, date, respectSoft) &&
            !reachedMax(emp)
          ));
          if (!candidate) break;
          place(date, station.id, candidate);
        }
      });
    });
  };

  // שלבים 6+8: מוצא אחרון - משמרות נוספות באותו יום עד התקרה היומית.
  const runMultiPass = (respectSoft: boolean) => {
    weekDays.forEach(date => {
      stations.forEach(station => {
        while (freeSlot(date, station.id) >= 0) {
          const multi = leastLoaded(employees.filter(emp =>
            availableStationsFor(emp).includes(station.id) &&
            employeeAssignments[emp.id][date] < dailyShiftCap(emp) &&
            !isBlocked(emp, date, respectSoft) &&
            !reachedMax(emp) &&
            !slotArr(date, station.id).includes(emp.name)
          ));
          if (!multi) break;
          const slot = freeSlot(date, station.id);
          slotArr(date, station.id)[slot] = multi.name;
          employeeAssignments[multi.id][date] += 1;
        }
      });
    });
  };

  runFillPass(true);   // שלב 5
  runMultiPass(true);  // שלב 6
  runFillPass(false);  // שלב 7 - אין ברירה: מותר לשבץ בימי "מעדיף שלא"
  runMultiPass(false); // שלב 8
```

- [ ] **Step 5: הרצה לוודא הצלחה**

Run: `npm test -- scheduler`
Expected: כל בדיקות ה-scheduler עוברות - **כולל כל הקיימות ללא שינוי** (רגרסיה). ואז `npx tsc --noEmit && npm test` מלא - 76 בדיקות ירוקות.

- [ ] **Step 6: Commit**

```bash
git add src/types/employee.ts src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat: העדפות רכות באלגוריתם - מעדיף-שלא מכובד אלא אם אין ברירה"
```

---

### Task 2: toggle תלת-מצבי במסך ההעדפות

**Files:**
- Modify: `src/components/WeeklyPreferences.tsx`

**Interfaces:**
- Consumes: `Employee.preferNotDays?: string[]` (Task 1) · `onUpdate(employeeId, updates: Partial<Employee>)` הקיים.

- [ ] **Step 1: לוגיקת המצבים**

החלף את `handleUnavailableToggle` (שורות 26-33) ב:

```ts
  type DayState = "available" | "preferNot" | "unavailable";

  const dayState = (date: string): DayState =>
    selectedEmp?.unavailableDays?.includes(date) ? "unavailable"
    : selectedEmp?.preferNotDays?.includes(date) ? "preferNot"
    : "available";

  // מחזור לחיצות: זמין, ואז "מעדיף שלא", ואז "לא זמין", וחוזר.
  // מעבר מצב שומר שהיום לעולם לא נמצא בשתי הרשימות יחד.
  const handleDayCycle = (date: string) => {
    if (!selectedEmp) return;
    const unavailable = selectedEmp.unavailableDays ?? [];
    const preferNot   = selectedEmp.preferNotDays ?? [];
    const state = dayState(date);
    if (state === "available") {
      onUpdate(selectedEmployee, { preferNotDays: [...preferNot, date] });
    } else if (state === "preferNot") {
      onUpdate(selectedEmployee, {
        preferNotDays: preferNot.filter(d => d !== date),
        unavailableDays: [...unavailable, date],
      });
    } else {
      onUpdate(selectedEmployee, { unavailableDays: unavailable.filter(d => d !== date) });
    }
  };
```

- [ ] **Step 2: שורת היום בתלת-מצב**

החלף את בלוק "Unavailable days" (שורות 124-158) ב (Checkbox במצב indeterminate = "מעדיף שלא"):

```tsx
          {/* Day availability - three states */}
          <div className="space-y-3">
            <h3 className="font-semibold">זמינות ימים</h3>
            <p className="text-xs text-muted-foreground">
              לחיצה מחליפה מצב: זמין, אחר כך "מעדיף שלא", אחר כך "לא זמין"
            </p>
            <div className="space-y-2">
              {weekDays.map((date, idx) => {
                const state = dayState(date);
                return (
                  <div
                    key={date}
                    className={`flex items-center space-x-2 space-x-reverse rounded-md px-3 py-2 transition-colors ${
                      state === "unavailable"
                        ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900"
                        : state === "preferNot"
                        ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
                        : ""
                    }`}
                  >
                    <Checkbox
                      id={`day-state-${date}`}
                      checked={state === "unavailable" ? true : state === "preferNot" ? "indeterminate" : false}
                      onCheckedChange={() => handleDayCycle(date)}
                    />
                    <Label htmlFor={`day-state-${date}`} className="cursor-pointer flex-1">
                      {hebrewDays[idx]}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({parseISODate(date).toLocaleDateString("he-IL")})
                      </span>
                    </Label>
                    {state === "unavailable" && (
                      <span className="text-xs text-red-500">לא זמין</span>
                    )}
                    {state === "preferNot" && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">מעדיף שלא</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
```

- [ ] **Step 3: צ'יפ סיכום**

בבלוק ה-badges (אחרי צ'יפ "ימים חסומים", שורה ~111) הוסף:

```tsx
            {(selectedEmp.preferNotDays?.length ?? 0) > 0 && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                {selectedEmp.preferNotDays!.length} ימי העדפה
              </Badge>
            )}
```

- [ ] **Step 4: שערים**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: הכל ירוק, בלי אזהרות lint חדשות.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeeklyPreferences.tsx
git commit -m "feat: toggle תלת-מצבי במסך ההעדפות - זמין / מעדיף שלא / לא זמין"
```

---

### Task 3: סימון ענבר בטבלת השיבוץ

**Files:**
- Modify: `src/components/ScheduleTable.tsx` (בלוק רינדור התא, ~שורות 187-216)

**Interfaces:**
- Consumes: `Employee.preferNotDays` (Task 1) · prop `employees` שכבר מגיע לקומפוננטה.

- [ ] **Step 1: הסימון**

בתוך בלוק רינדור תא מאויש (אחרי `{name ? (` ~שורה 188), בתחילת ה-div `flex items-center gap-0.5`, חשב:

```tsx
                              {(() => {
                                const softBroken = employees.find(e => e.name === name)?.preferNotDays?.includes(date);
                                return softBroken ? (
                                  <span
                                    className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                                    title="שובץ ביום שהעובד מעדיף שלא - לא הייתה חלופה"
                                  />
                                ) : null;
                              })()}
```

מקם את ה-span לפני ה-Badge של השם (אח קודם בתוך אותו div, שורה ~189). אם ה-IIFE לא מסתדר עם סגנון הקובץ - חלץ משתנה `const softBroken = ...` בראש גוף ה-map של ה-slot (איפה ש-`name`/`date` כבר בסקופ) והשתמש ב-`{softBroken && <span .../>}`.

- [ ] **Step 2: שערים**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: הכל ירוק.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScheduleTable.tsx
git commit -m "feat: סימון ענבר בתא כששובץ ביום מעדיף-שלא"
```

---

### Task 4: מדריך משתמש (md + PDF)

**Files:**
- Modify: `public/user-guide.md` (סעיף "העדפות שבועיות", ~שורה 112)
- Regenerate: `public/user-guide.pdf`

- [ ] **Step 1:** קרא את `public/user-guide.md`, ובסוף סעיף "## העדפות שבועיות" הוסף:

```markdown
לצד "לא זמין" אפשר לסמן ימי "מעדיף שלא" - לחיצה על יום מחליפה בין שלושת המצבים (זמין, מעדיף שלא, לא זמין). האלגוריתם נמנע מלשבץ בימי "מעדיף שלא" אלא אם אין ברירה, ותא שבו ההעדפה נשברה מסומן בנקודה כתומה.
```

- [ ] **Step 2:** יצירת PDF מחדש - אותו תהליך כמו בפיצ'רים הקודמים (npx -y marked, עטיפת RTL בתיקיית scratchpad, Chrome headless `--print-to-pdf`). התבנית המלאה: ראה `docs/superpowers/plans/2026-07-18-export-empty-slots-warning.md` Task 2 Step 2.

- [ ] **Step 3:** אימות ויזואלי של ה-PDF (Read) - הפסקה מופיעה בסעיף ההעדפות, RTL תקין.

- [ ] **Step 4: Commit**

```bash
git add public/user-guide.md public/user-guide.pdf
git commit -m "docs: מדריך משתמש - העדפות רכות (מעדיף שלא)"
```

---

### Task 5: אינטגרציה (מתזמר בלבד)

- [ ] סקירת-ענף סופית (Opus - נוגע באלגוריתם הליבה).
- [ ] מיזוג ff ל-main, push, פריסה אוטומטית ירוקה.
- [ ] אימות חי בפרודקשן (Playwright + חשבון-בדיקה): סימון מעדיף-שלא במסך העדפות (מחזור שלושת המצבים), יצירת שיבוץ - העובד לא משובץ ביום המועדף-שלא כשיש חלופה; תרחיש אין-ברירה מציג נקודת ענבר בתא. ניקוי נתוני-בדיקה מלא.
- [ ] עדכון memory (בקלוג #6 הושלם).

## Self-Review (בוצע בכתיבה)

- **כיסוי spec:** טיפוס+אלגוריתם+5 בדיקות (Task 1) · toggle תלת-מצבי+צ'יפ (Task 2) · סימון ענבר (Task 3) · מדריך (Task 4) · אימות חי (Task 5). בדיקת-הרגרסיה (דרישה 5 ב-spec) ממומשת כ-gate "כל הבדיקות הקיימות ללא שינוי".
- **עקביות:** `preferNotDays` אחיד בכל המשימות; `isBlocked(emp, date, respectSoft)` מוגדר ב-Task 1 בלבד ומשומש רק שם.
- **אין placeholders.**
- **הערת-שוליים לסוקרים:** הגשת-זמינות של עובד (פיצ'ר #2) דורסת רק את `unavailableDays` - יום יכול תיאורטית להיות גם preferNot (מנהל) וגם unavailable (עובד); הקשיח גובר בכל מקום (dayState בודק unavailable קודם, isBlocked ממילא חוסם) - עקבי ולא באג.
