# Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** רידיזיין חזותי דרמטי של מערכת השיבוץ לכיוון editorial (טורקיז דיו + Assistant + signature "מהדורה שבועית"), בשכבת ההצגה בלבד, תוך שמירה מלאה על הפונקציונליות.

**Architecture:** שינוי מבוסס design tokens. מחליפים את ערכי ה-CSS variables ב-`src/index.css` ואת הפונט, ואז מיישרים את ה-styling של הרכיבים (Tailwind classes + מעט markup חדש). מוסיפים מודול לוגי קטן אחד להקצאת צבעי-עובד, ומתג העדפה "ללא צבעים" שנשמר ומסונכרן בדפוס הקיים.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind 3 + shadcn/ui (Radix) + lucide-react. עברית RTL. Supabase לסנכרון.

## Global Constraints

- **כתיבה: רק מקף רגיל ( - )**, אסור מקף ארוך (— או –) בשום מקום: קוד, UI, תיעוד, commit messages.
- **בעברית: בלי חצים** (← → וכו') - הם מתהפכים ב-RTL. להשתמש במילים או בנקודתיים.
- **RTL מלא** - כל שינוי נבדק בכיוון RTL.
- **שכבת הצגה בלבד** - אסור לשנות לוגיקת scheduler, מבנה Supabase, או ניהול state קיים מעבר לתוספת `cellColors`.
- **אין test runner** - אימות = `npm run build` + `npm run lint` + אימות ויזואלי ב-`npm run dev`.
- **פונט יחיד: Assistant**. צבע עוגן: טורקיז #0E6E66. רקע נייר #FBFAF7. דיו #16302E.
- **commit אחרי כל משימה**. סיום commit message ב: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `src/index.css` - טוקנים חדשים (אור + כהה), פונט Assistant, utilities. (modify)
- `src/lib/employeeColors.ts` - חדש: הקצאת צבעי-עובד הרמוניים + וריאנט light/dark. (create)
- `src/components/ScheduleTable.tsx` - broadsheet + צבעי-עובד + תמיכה במתג ללא-צבעים. (modify)
- `src/pages/Index.tsx` - top bar, ניווט אינדקס, masthead, שורת סטטוס, עומס, state ל-cellColors. (modify)
- `src/pages/LoginPage.tsx` - layout שער-גיליון. (modify)
- רכיבי משנה - יישור styling: `StationManager.tsx`, `EmployeeList.tsx`, `EmployeeForm.tsx`, `WeeklyPreferences.tsx`, `ScheduleChanges.tsx`, `MonthlyReport.tsx`, `ContactDeveloper.tsx`. (modify)

---

### Task 1: יסודות - טוקנים, פונט, מצב כהה

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Produces: CSS variables חדשים (`--background`, `--foreground`, `--primary`, `--border`, וכו') בערכי טורקיז דיו לאור וכהה; `font-family: 'Assistant'` על body; utilities `.masthead-title`, `.hairline`, `.index-link`.

- [ ] **Step 1: החלפת ה-import של הפונט וה-font-family**

ב-`src/index.css` שורה 1, החלף את ה-import של Inter:

```css
@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap');
```

ובתוך `@layer base` בבלוק ה-`body` (סביב שורה 88-94), החלף את ה-font-family:

```css
  body {
    @apply bg-background text-foreground;
    direction: rtl;
    font-family: 'Assistant', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
```

(הסר את שורת `font-feature-settings` הישנה - היא הייתה ל-Inter.)

- [ ] **Step 2: החלפת טוקני מצב אור**

החלף את כל בלוק `:root` (שורות 8-44) בערכים הבאים:

```css
  :root {
    --background: 48 30% 98%;
    --foreground: 175 37% 14%;

    --card: 0 0% 100%;
    --card-foreground: 175 37% 14%;

    --popover: 0 0% 100%;
    --popover-foreground: 175 37% 14%;

    --primary: 175 77% 24%;
    --primary-foreground: 0 0% 100%;

    --secondary: 156 17% 94%;
    --secondary-foreground: 175 30% 20%;

    --muted: 156 14% 95%;
    --muted-foreground: 168 8% 45%;

    --accent: 175 40% 94%;
    --accent-foreground: 175 77% 22%;

    --destructive: 3 53% 50%;
    --destructive-foreground: 0 0% 100%;

    --success: 158 80% 27%;
    --success-foreground: 0 0% 100%;

    --warning: 38 74% 45%;
    --warning-foreground: 38 80% 12%;

    --border: 156 17% 90%;
    --input: 156 17% 88%;
    --ring: 175 77% 24%;

    --radius: 0.625rem;

    --border-strong: 175 37% 14%;
  }
```

- [ ] **Step 3: החלפת טוקני מצב כהה**

החלף את כל בלוק `.dark` (שורות 46-80) בערכים הבאים:

```css
  .dark {
    --background: 174 41% 10%;
    --foreground: 48 25% 92%;

    --card: 175 37% 14%;
    --card-foreground: 48 25% 92%;

    --popover: 175 37% 14%;
    --popover-foreground: 48 25% 92%;

    --primary: 173 56% 42%;
    --primary-foreground: 174 41% 8%;

    --secondary: 175 25% 20%;
    --secondary-foreground: 48 20% 88%;

    --muted: 175 22% 18%;
    --muted-foreground: 168 12% 60%;

    --accent: 175 35% 22%;
    --accent-foreground: 173 56% 70%;

    --destructive: 3 50% 52%;
    --destructive-foreground: 0 0% 100%;

    --success: 158 55% 42%;
    --success-foreground: 0 0% 100%;

    --warning: 38 70% 55%;
    --warning-foreground: 38 80% 10%;

    --border: 175 25% 24%;
    --input: 175 25% 22%;
    --ring: 173 56% 42%;

    --border-strong: 48 25% 88%;
  }
```

- [ ] **Step 4: עדכון ה-utilities**

החלף את בלוק `@layer utilities` (שורות 101-117) ב:

```css
@layer utilities {
  .hairline { border-color: hsl(var(--border)); }

  .masthead-title {
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 0.98;
  }

  .index-num {
    font-size: 0.6875rem;
    font-weight: 700;
    color: hsl(var(--muted-foreground));
  }

  .glass {
    @apply backdrop-blur-md;
    background: hsl(var(--background) / 0.82);
  }

  .card-hover {
    @apply transition-all duration-200 hover:shadow-md hover:-translate-y-0.5;
  }
}
```

(הוסרו `.gradient-text` ו-`.dark .gradient-text` - אין יותר גרדיאנט. אם משהו עדיין משתמש ב-`gradient-text`, יוחלף ב-`text-primary` במשימות הבאות.)

- [ ] **Step 5: הוספת תמיכה ב-reduced-motion**

הוסף בסוף הקובץ:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 6: אימות build + lint**

Run: `npm run build && npm run lint`
Expected: build עובר ללא שגיאות. (ייתכנו שגיאות lint על `gradient-text` שעדיין בשימוש - יטופלו במשימות הבאות; אם build נכשל, תקן לפני המשך.)

- [ ] **Step 7: אימות ויזואלי**

Run: `npm run dev`
פתח את האפליקציה. צפוי: רקע נייר חם, טקסט דיו, פונט Assistant. החלף מצב כהה - צפוי רקע טורקיז-דיו עמוק. (הרכיבים עדיין לא מעוצבים מחדש - בודקים רק שהטוקנים והפונט נטענו.)

- [ ] **Step 8: Commit**

```bash
git add src/index.css
git commit -m "feat: editorial design tokens - teal ink palette + Assistant font

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: מודול צבעי-עובד

**Files:**
- Create: `src/lib/employeeColors.ts`
- Create: `scripts/check-employee-colors.mjs` (בדיקת assertion חד-פעמית)

**Interfaces:**
- Produces:
  - `getEmployeeColor(name: string, dark?: boolean): { bg: string; text: string; accent: string }` - מחזיר ערכי HSL כמחרוזות CSS. עקבי: אותו שם מחזיר תמיד אותו גוון.
  - `EMPLOYEE_HUES: number[]` - מערך הגוונים.

- [ ] **Step 1: כתיבת בדיקת ה-assertion (failing)**

צור `scripts/check-employee-colors.mjs`:

```js
import { getEmployeeColor, EMPLOYEE_HUES } from "../src/lib/employeeColors.ts";

// יציבות: אותו שם, אותו צבע
const a = getEmployeeColor("דנה");
const b = getEmployeeColor("דנה");
if (a.bg !== b.bg) throw new Error("not stable for same name");

// שמות שונים נוטים לצבעים שונים (לא ערובה מוחלטת, אבל לפחות לא הכל זהה)
const names = ["דנה", "יוסי", "מאיה", "רון", "לי", "נועה", "גיל", "אבי"];
const bgs = new Set(names.map((n) => getEmployeeColor(n).bg));
if (bgs.size < 4) throw new Error("too many collisions");

// וריאנט כהה שונה מאור
if (getEmployeeColor("דנה", true).bg === getEmployeeColor("דנה", false).bg) {
  throw new Error("dark variant should differ");
}

// מבנה תקין
for (const k of ["bg", "text", "accent"]) {
  if (typeof a[k] !== "string") throw new Error("missing " + k);
}

console.log("OK - employee colors stable, varied, dark-aware. hues:", EMPLOYEE_HUES.length);
```

- [ ] **Step 2: הרצה כדי לוודא כישלון**

Run: `node --experimental-strip-types scripts/check-employee-colors.mjs`
Expected: FAIL - הקובץ `src/lib/employeeColors.ts` עדיין לא קיים.

- [ ] **Step 3: מימוש המודול**

צור `src/lib/employeeColors.ts`:

```ts
// פלטת גוונים הרמונית: מרווחים שווה יחסית סביב גלגל הצבעים,
// נמנעים מאזורים שמתנגשים עם הטורקיז של המותג (סביב 175).
export const EMPLOYEE_HUES = [
  350, 38, 145, 205, 280, 18, 320, 75, 50, 230, 165, 300,
];

// hash יציב ופשוט (FNV-1a מקוצר) משם העובד אל מספר.
function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface EmployeeColor {
  bg: string;
  text: string;
  accent: string;
}

export function getEmployeeColor(name: string, dark = false): EmployeeColor {
  const hue = EMPLOYEE_HUES[hashName(name) % EMPLOYEE_HUES.length];
  if (dark) {
    return {
      bg: `hsl(${hue} 30% 26%)`,
      text: `hsl(${hue} 35% 82%)`,
      accent: `hsl(${hue} 45% 55%)`,
    };
  }
  return {
    bg: `hsl(${hue} 44% 89%)`,
    text: `hsl(${hue} 45% 32%)`,
    accent: `hsl(${hue} 48% 46%)`,
  };
}
```

- [ ] **Step 4: הרצה כדי לוודא הצלחה**

Run: `node --experimental-strip-types scripts/check-employee-colors.mjs`
Expected: PASS - מודפס "OK - employee colors stable, varied, dark-aware. hues: 12"

(אם הסביבה לא תומכת ב-`--experimental-strip-types`, הסר את `: string`/הטיפוסים מהבדיקה או הרץ דרך `npx tsx scripts/check-employee-colors.mjs`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/employeeColors.ts scripts/check-employee-colors.mjs
git commit -m "feat: harmonized per-employee color assignment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: state ומתג "ללא צבעים"

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: דפוס ה-state/localStorage/Supabase הקיים ב-Index.
- Produces: `cellColors: boolean` state (ברירת מחדל true), נשמר ב-localStorage ומסונכרן ב-Supabase; מועבר כ-prop ל-`ScheduleTable`.

- [ ] **Step 1: הוספת ה-state**

ב-`src/pages/Index.tsx`, ליד שאר ה-state (אחרי בלוק ה-darkMode, סביב שורה 65), הוסף:

```tsx
  // ── Cell colors preference ──────────────────────────────
  const [cellColors, setCellColors] = useState<boolean>(() => {
    const saved = localStorage.getItem("cellColors");
    return saved === null ? true : saved === "true";
  });
```

- [ ] **Step 2: שמירה + סנכרון**

ב-`src/pages/Index.tsx`, בתוך בלוק ה-effects של ה-persist (אחרי שורת `scheduleTemplates`, סביב שורה 178), הוסף:

```tsx
  useEffect(() => { localStorage.setItem("cellColors", String(cellColors)); syncToSupabase("cellColors", cellColors); }, [cellColors, syncToSupabase]);
```

- [ ] **Step 3: טעינה מ-Supabase**

ב-`src/pages/Index.tsx`, בתוך ה-effect של הטעינה מ-Supabase (סביב שורות 187-206), הוסף את `"cellColors"` למערך `LOCAL_KEYS`, וב-branch של `data.length > 0` הוסף:

```tsx
        if (store.cellColors !== undefined) setCellColors(store.cellColors as boolean);
```

ובמנוי ה-real-time (סביב שורות 224-231), הוסף ענף:

```tsx
        else if (key === "cellColors") setCellColors(value as boolean);
```

- [ ] **Step 4: אימות build**

Run: `npm run build`
Expected: PASS (ה-prop יחובר ל-ScheduleTable במשימה 4; כרגע רק ה-state קיים).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: cellColors preference state with sync

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: טבלת broadsheet + צבעי-עובד

**Files:**
- Modify: `src/components/ScheduleTable.tsx`
- Modify: `src/pages/Index.tsx` (העברת prop)

**Interfaces:**
- Consumes: `getEmployeeColor` ממשימה 2; `cellColors` ממשימה 3.
- Produces: טבלה בסגנון broadsheet עם תאי-עובד צבעוניים (או נקיים כש-`cellColors=false`).

- [ ] **Step 1: קריאת המבנה הקיים**

קרא את `src/components/ScheduleTable.tsx` במלואו כדי להבין את ה-props, רינדור התאים, מצב הנעילה והעריכה. אתר את ה-prop interface ואת המקום שבו שם העובד מרונדר בתא.

- [ ] **Step 2: הוספת ה-prop ל-interface**

ב-`ScheduleTable.tsx`, הוסף ל-props interface:

```tsx
  cellColors?: boolean;
```

קבל אותו ב-destructuring של הרכיב עם ברירת מחדל `cellColors = true`.

- [ ] **Step 3: ייבוא והחלת צבע על תא העובד**

הוסף בראש הקובץ:

```tsx
import { getEmployeeColor } from "@/lib/employeeColors";
```

זהה אם האפליקציה במצב כהה (קרא `document.documentElement.classList.contains("dark")` בתוך הרינדור, או קבל `darkMode` כ-prop אם נוח). במקום שבו מרונדר שם עובד לא-ריק בתא, החל סגנון: כש-`cellColors` פעיל ויש שם, עטוף את השם ב-`<span>` עם:

```tsx
const color = name ? getEmployeeColor(name, isDark) : null;
const cellStyle = (cellColors && color)
  ? { background: color.bg, color: color.text, borderRight: `3px solid ${color.accent}` }
  : undefined;
```

והחל `style={cellStyle}` על אלמנט ה-chip של השם, עם class שמבטיח `border-radius`, `padding` ו-`padding-right` מתאימים (למשל `rounded-md px-2.5 py-1 pr-2 font-semibold`). כש-`cellColors=false` או תא ריק - בלי הסגנון, שם רגיל בלבד.

- [ ] **Step 4: סגנון broadsheet לטבלה**

עדכן את ה-classes של הטבלה:
- כותרות ימים (`thead th`): `border-b-2` בצבע `hsl(var(--border-strong))` (השתמש ב-`style={{ borderBottomColor: 'hsl(var(--border-strong))' }}` או class ייעודי), פונט bold, שם יום + תאריך קטן מתחת.
- שורות (`tbody tr`): `border-b border-border` (קו שיער).
- עמודת עמדות (`tbody th` הימנית): `border-l border-border`, יישור לימין, bold.
- הסר רקעי גרדיאנט/צבעים ישנים אם קיימים; הרקע הוא `bg-card`.
- עטוף את הטבלה ב-`rounded-2xl border border-border overflow-hidden bg-card`.

שמור על כל הלוגיקה הקיימת (עריכת תא, נעילה, swap) ללא שינוי - רק styling.

- [ ] **Step 5: העברת ה-prop מ-Index**

ב-`src/pages/Index.tsx`, במקום הרינדור של `<ScheduleTable ... />` (סביב שורה 928), הוסף:

```tsx
                    cellColors={cellColors}
```

- [ ] **Step 6: מתג "ללא צבעים"**

ב-`src/pages/Index.tsx`, ליד פעולות הטבלה (אזור ה-export PNG/Excel, סביב שורות 918-925), הוסף מתג קומפקטי:

```tsx
                  <div className="flex items-center gap-2">
                    <Switch id="cell-colors" checked={cellColors} onCheckedChange={setCellColors} />
                    <Label htmlFor="cell-colors" className="text-sm cursor-pointer text-muted-foreground">צבע לעובד</Label>
                  </div>
```

(`Switch` ו-`Label` כבר מיובאים ב-Index.)

- [ ] **Step 7: אימות**

Run: `npm run build && npm run lint`
Expected: PASS.
Run: `npm run dev` - צור שיבוץ. צפוי: תאים עם צבע-עובד מתואם + פס מבטא ימני, קווי broadsheet. כבה את "צבע לעובד" - התאים הופכים לשמות נקיים. בדוק מצב כהה - הצבעים מותאמים.

- [ ] **Step 8: Commit**

```bash
git add src/components/ScheduleTable.tsx src/pages/Index.tsx
git commit -m "feat: broadsheet schedule table with per-employee colors and toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Index - top bar, ניווט אינדקס, masthead, סטטוס, עומס

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: ה-state והפעולות הקיימים ב-Index ללא שינוי לוגי.
- Produces: header, ניווט, masthead, שורת סטטוס ועומס מעוצבים מחדש.

- [ ] **Step 1: Top bar**

החלף את ה-`<header>` (שורות 595-646) כך:
- מיכל `sticky top-0 z-10 border-b border-border glass`.
- מותג: לוגו (`/logo.svg`, `w-8 h-8 rounded-lg`) + wordmark "שיבוץ" ב-`font-extrabold text-lg` + טאגליין קטן "ניהול שיבוצים חכם" ב-`text-xs text-muted-foreground`.
- ספירת עובדים/עמדות - הסר מה-header (תעבור ל-masthead).
- ימין (כלים): שבב ארגון `rounded-full border border-border px-3 py-1` עם נקודת `bg-success` + שם הארגון; אינדיקטור סנכרון (השאר את הלוגיקה הקיימת של `syncStatus`); `ContactDeveloper`; כפתור מצב כהה; יציאה. הסר כל `gradient-text` - השתמש ב-`text-foreground`/`text-primary`.

- [ ] **Step 2: ניווט אינדקס**

החלף את ה-`<TabsList>` (שורות 650-666). שמור על `TabsTrigger value=...` (ה-API של Radix), אבל עצב כאינדקס: מיכל `border-b border-border`, כל trigger `bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground gap-2 px-0`. הוסף מספור עם `<span className="index-num">01</span> עמדות` וכו' (01 עמדות, 02 עובדים, 03 העדפות, 04 שיבוץ, 05 דוחות). הסר את הרקע האפור והגלולות.

הערה: כדי שהקו התחתון יישב נכון, ה-`TabsList` צריך `h-auto bg-transparent p-0 gap-7 justify-start rounded-none`.

- [ ] **Step 3: Masthead (signature) בטאב השיבוץ**

בראש `<TabsContent value="schedule">` (לפני ה-top bar הפנימי, שורה 752), הוסף masthead:

```tsx
            <div className="flex items-end justify-between gap-6 flex-wrap pt-2">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="w-6 h-0.5 bg-primary" />
                  <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">
                    מהדורה שבועית · גיליון {getWeekNumber(weekStart)}
                  </span>
                </div>
                <h1 className="masthead-title text-4xl sm:text-5xl text-foreground">שיבוץ שבועי</h1>
                <p className="text-muted-foreground mt-2 font-medium">
                  {formatWeekRange(weekStart)}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{employees.length} עובדים</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{stations.length} עמדות</span>
                </div>
              </div>
            </div>
```

הסר את כותרת "שיבוץ שבועי" הישנה והאייקון-בריבוע מה-top bar הפנימי (שורות 755-760), כי ה-masthead מחליף אותם. השאר את כפתורי הפעולה.

- [ ] **Step 4: פונקציות עזר getWeekNumber ו-formatWeekRange**

הוסף ליד שאר פונקציות העזר בראש הקובץ (אחרי `getWeekDays`, סביב שורה 45):

```tsx
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);
  const s = weekStart.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" });
  const e = end.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return `${s} · ${e}`;
}
```

- [ ] **Step 5: שורת סטטוס כיסוי editorial**

החלף את באנרי הכיסוי (שורות 893-916) בשורה אחת מאופקת:

```tsx
                <div className="flex items-center gap-2.5 py-3 border-y border-border text-sm font-medium flex-wrap">
                  {underScheduled.length === 0 && emptySlots === 0 ? (
                    <><span className="w-2 h-2 rounded-full bg-success shrink-0" />השיבוץ מלא - כל העובדים קיבלו את מינימום המשמרות</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                      {emptySlots > 0 && <span className="text-foreground">{emptySlots} משבצות ריקות</span>}
                      {underScheduled.length > 0 && <span className="text-muted-foreground">· מתחת למינימום: {underScheduled.map(w => `${w.emp.name} (${w.shifts}/${w.emp.minWeeklyShifts})`).join(", ")}</span>}
                    </>
                  )}
                </div>
```

- [ ] **Step 6: עומס עובדים רזה**

עדכן את כרטיס "עומס עובדים השבוע" (שורות 942-973): הסר את עטיפת ה-`Card`, השתמש בכותרת סקשן `text-xs tracking-widest uppercase text-muted-foreground font-bold mb-4` ובפסים דקים (`h-1.5`) בצבעי `bg-success`/`bg-warning`/`bg-destructive` לפי `isOver`/`isUnder`. שמור על לוגיקת `pct`/`isUnder`/`isOver` הקיימת.

- [ ] **Step 7: כותרות הסקשנים בטאבים האחרים**

בטאבים stations/employees/preferences/reports, החלף את הריבועים בגרדיאנט (`bg-gradient-to-br from-indigo-500 to-violet-600`, שורות 671-673 וכו') באייקון פשוט בתוך `w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center`, וכותרת `text-xl font-extrabold`. החלף את כל מופעי הגרדיאנט בטורקיז מלא.

- [ ] **Step 8: כפתורי גרדיאנט ומצב ריק**

החלף את כל `bg-gradient-to-l from-indigo-600 to-violet-600 ...` (כפתורי "צור שיבוץ" וכו', שורות 999-1001 ועוד) ב-`bg-primary hover:bg-primary/90 text-primary-foreground`. עדכן את ה-empty state (שורות 993-1002): רקע `bg-primary/5 border-2 border-dashed border-border rounded-2xl`, אייקון בתוך עיגול `bg-primary/10 text-primary`.

- [ ] **Step 9: אימות**

Run: `npm run build && npm run lint`
Expected: PASS, בלי שגיאות על `gradient-text` (כולן הוחלפו).
Run: `npm run dev` - בדוק: top bar חדש, ניווט אינדקס ממוספר עם קו תחתון, masthead "מהדורה שבועית · גיליון N" עם כותרת ענק וטווח תאריכים, שורת סטטוס, עומס רזה. בדוק אור וכהה, ובדוק במובייל (responsive).

- [ ] **Step 10: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: editorial Index - top bar, index nav, weekly edition masthead

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: מסך התחברות - שער גיליון

**Files:**
- Modify: `src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `signIn`, `signUp` הקיימים, חוקי הסיסמה הקיימים - ללא שינוי לוגי.
- Produces: layout דו-טורי בסגנון שער גיליון.

- [ ] **Step 1: מיכל ורקע**

החלף את ה-`<div className="min-h-screen bg-gradient-to-br from-indigo-50 ...">` (שורה 58) ב-`min-h-screen bg-background flex flex-col lg:flex-row` ב-`dir="rtl"`. הסר את הגרדיאנט הסגול/אינדיגו לחלוטין.

- [ ] **Step 2: טור ה-masthead (שער)**

הוסף טור ימני (תחילת RTL) שמופיע ב-`lg` ומעל:

```tsx
        <div className="lg:flex-1 flex flex-col justify-center px-8 lg:px-16 py-12 bg-primary/5 border-b lg:border-b-0 lg:border-l border-border">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-6 h-0.5 bg-primary" />
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-primary">מערכת שיבוץ עובדים</span>
          </div>
          <h1 className="masthead-title text-5xl lg:text-6xl text-foreground mb-4">שיבוץ<br/>שבועי חכם</h1>
          <p className="text-muted-foreground text-lg max-w-sm">פלטפורמה לניהול שיבוצים - כל ארגון מקבל סביבת נתונים מבודדת ומאובטחת.</p>
          <img src="/logo.svg" alt="" aria-hidden="true" className="w-12 h-12 rounded-xl mt-8" />
        </div>
```

- [ ] **Step 3: טור הטופס**

עטוף את ה-`Card` הקיים בטור שני `lg:flex-1 flex items-center justify-center px-6 py-12`. השאר את כל ה-`Tabs`/`form`/שדות/חוקי-סיסמה הקיימים, אבל:
- `TabsList`: הסר את הרקע האפור והגלולות; עצב כאינדקס (כמו במשימה 5 step 2) - `bg-transparent p-0 gap-6 border-b border-border rounded-none h-auto`, כל trigger `rounded-none border-b-2 border-transparent data-[state=active]:border-primary bg-transparent px-0`.
- כפתורי ה-submit: החלף `bg-gradient-to-l from-indigo-600 ...` ב-`bg-primary hover:bg-primary/90`.
- הסר את הכותרת/לוגו הכפולים מראש הכרטיס (שורות 61-70) - ה-masthead בטור הימני מחליף אותם.

- [ ] **Step 4: אימות**

Run: `npm run build && npm run lint`
Expected: PASS.
Run: `npm run dev` - התנתק כדי לראות את מסך ההתחברות. צפוי: שני טורים בדסקטופ (שער + טופס), טור יחיד במובייל, בלי גרדיאנט סגול. בדוק כניסה והרשמה, וחוקי הסיסמה. בדוק אור וכהה.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat: gate-cover login layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: יישור רכיבי משנה

**Files:**
- Modify: `src/components/StationManager.tsx`, `src/components/EmployeeList.tsx`, `src/components/EmployeeForm.tsx`, `src/components/WeeklyPreferences.tsx`, `src/components/ScheduleChanges.tsx`, `src/components/MonthlyReport.tsx`, `src/components/ContactDeveloper.tsx`

**Interfaces:**
- Produces: סגנון אחיד בכל הרכיבים (טורקיז, נייר, קווי שיער, Assistant), ללא גרדיאנטים אינדיגו/סגול.

- [ ] **Step 1: סריקת שאריות**

Run: `npx rg -n "indigo|violet|gradient-text|from-indigo|to-violet|purple" src/components`
זהה כל מופע של צבעי אינדיגו/סגול/גרדיאנט בקבצי הרכיבים.

- [ ] **Step 2: החלפה שיטתית**

בכל רכיב, החלף:
- `text-violet-*` / `text-indigo-*` / `gradient-text` -> `text-primary` או `text-foreground`.
- `bg-gradient-to-* from-indigo-* to-violet-*` -> `bg-primary`.
- `bg-violet-100 text-violet-700` (שבבים) -> `bg-primary/10 text-primary`.
- רקעי `bg-indigo-50` וכו' -> `bg-primary/5` או `bg-muted`.
- ריבועי אייקון בגרדיאנט -> `bg-primary/10 text-primary`.
שמור על כל הלוגיקה והמבנה; styling בלבד. ודא שכותרות משתמשות במשקלי Assistant (`font-extrabold`/`font-bold`).

- [ ] **Step 3: אימות סריקה נקייה**

Run: `npx rg -n "indigo|violet|gradient-text|from-indigo|to-violet" src`
Expected: אין תוצאות (פרט אולי לתגובות). אם יש - תקן.

- [ ] **Step 4: אימות build + ויזואלי**

Run: `npm run build && npm run lint`
Expected: PASS.
Run: `npm run dev` - עבור על כל הטאבים (עמדות, עובדים, העדפות, שיבוץ, דוחות), פתח דיאלוגים (שמירה, תבנית), ובדוק את ContactDeveloper. צפוי: שפה אחידה, בלי שום סגול/אינדיגו. בדוק אור וכהה.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: align supporting components to editorial language

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: ליטוש - אנימציה ונגישות

**Files:**
- Modify: `src/index.css`, `src/pages/Index.tsx`

**Interfaces:**
- Produces: כניסת masthead, focus-visible גלובלי, ואימות reduced-motion.

- [ ] **Step 1: focus-visible גלובלי**

הוסף ל-`@layer base` ב-`src/index.css`:

```css
  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
    border-radius: 4px;
  }
```

- [ ] **Step 2: כניסת masthead**

הוסף ל-`src/index.css`:

```css
@keyframes mast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.masthead-title { animation: mast-in 0.4s ease-out both; }
```

(תחת reduced-motion ה-animation מתבטל אוטומטית מהכלל שב-Task 1.)

- [ ] **Step 3: אימות**

Run: `npm run build`
Expected: PASS.
Run: `npm run dev` - ה-masthead נכנס בעדינות. נווט במקלדת (Tab) - טבעת focus טורקיז נראית. הפעל reduced-motion ב-OS - הכניסה נעלמת מיידית.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/pages/Index.tsx
git commit -m "polish: masthead entrance + visible keyboard focus

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: בדיקות סיום - אבטחת מידע ונגישות

**Files:** (אין שינוי קוד אלא אם הבדיקות מעלות ממצא)

- [ ] **Step 1: בדיקת אבטחת מידע**

הפעל את מיומנות `security-review` על ה-diff של הסניף. סקור ממצאים; תקן רק ממצאים אמיתיים הקשורים לשינויי הרידיזיין (לרוב לא צפויים בשינוי הצגה, אבל ודא שלא נחשפו מפתחות/PII ושלא נשבר ה-RLS/הסנכרון).

- [ ] **Step 2: בדיקת נגישות**

עבור על רשימת הנגישות מ-modern-web-design:
- ניגודיות: טקסט דיו על נייר ועל כל צבעי-העובד (הטקסט הטונאלי הכהה צריך לעמוד ב-4.5:1). בדוק לפחות 3-4 גוונים מהפלטה בכלי ניגודיות.
- מקלדת: כל אלמנט אינטראקטיבי נגיש ב-Tab עם focus נראה.
- יעדי מגע 44px+ במובייל.
- reduced-motion מכובד.
- `dir="rtl"` שלם, בלי חצים.
תקן ממצאים. אם צבע-עובד כלשהו נכשל בניגודיות, התאם את ה-L של הטקסט ב-`employeeColors.ts`.

- [ ] **Step 3: אימות סופי**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit (אם היו תיקונים)**

```bash
git add -A
git commit -m "fix: accessibility and security review findings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (בוצע)

- **כיסוי האפיון:** טוקנים (Task 1), טיפוגרפיה (Task 1), top bar + ניווט + masthead + סטטוס + עומס (Task 5), טבלת broadsheet + צבעי-עובד + מתג (Tasks 2-4), התחברות (Task 6), רכיבי משנה + דיאלוגים (Task 7), אנימציה + נגישות (Task 8), אבטחה + נגישות (Task 9). מצב כהה מכוסה ב-Task 1 ונבדק לאורך. כל סעיף באפיון ממופה למשימה.
- **Placeholders:** אין. כל צעד מכיל קוד או פקודה קונקרטית.
- **עקביות טיפוסים:** `getEmployeeColor(name, dark)` ו-`EmployeeColor {bg,text,accent}` מוגדרים ב-Task 2 ונצרכים ב-Task 4. `cellColors: boolean` מוגדר ב-Task 3, נצרך ב-Task 4. `getWeekNumber`/`formatWeekRange` מוגדרים ונצרכים ב-Task 5.
- **נקודה לתשומת לב בביצוע:** זיהוי מצב כהה ב-ScheduleTable (Task 4 step 3) - אם קריאת ה-DOM ברינדור בעייתית, עדיף להעביר `darkMode` כ-prop מ-Index (שכבר מחזיק אותו ב-state).
