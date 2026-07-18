# אזהרת משבצות-ריקות לפני ייצוא/פרסום - תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** דיאלוג אישור "יש X משבצות ריקות - להמשיך?" לפני פרסום-לצוות / ייצוא-PNG / ייצוא-Excel, כשיש משבצות ריקות בשיבוץ.

**Architecture:** state יחיד `pendingExportAction` + פונקציית-שומר `guardEmptySlots` + AlertDialog משותף אחד בדפוס הקיים (אישור מחיקת-עמדה). הכל בקובץ `src/pages/Index.tsx` בלבד.

**Tech Stack:** React 18 + TypeScript, shadcn/ui AlertDialog (כבר מיובא ב-Index.tsx).

**Spec:** `docs/superpowers/specs/2026-07-18-export-empty-slots-warning-design.md`

## Global Constraints

- עברית בלבד ב-UI, מקף רגיל ( - ), בלי חצים (→).
- **branch:** `feat/export-empty-slots-warning` בתיקיית הפרויקט הראשית (לא worktree). כל משימה נפתחת ב-`git branch --show-current` - עצור אם לא תואם.
- שערים לכל משימה: `npx tsc --noEmit && npm test && npm run lint` (בלי אזהרות חדשות מעל baseline 10) `&& npm run build`.
- אפס שינוי התנהגות כשאין משבצות ריקות.

---

### Task 1: שומר + דיאלוג ב-Index.tsx

**Files:**
- Modify: `src/pages/Index.tsx` (שלושה אזורים: אחרי ה-memo של emptySlots ~שורה 897; כפתור הפרסום ~1199; כפתורי PNG/Excel ~1286-1291; ורינדור דיאלוג אחרי דיאלוג מחיקת-העמדה ~1469)

**Interfaces:**
- Consumes: `emptySlots` (useMemo קיים, ~שורה 891), `handlePublish`, `handleExportToImage`, `handleExportToExcel` (קיימים), רכיבי AlertDialog (מיובאים כבר בשורה 10).
- Produces: אין - שינוי פנימי לקומפוננטה.

- [ ] **Step 1: state ופונקציית השומר**

מיד אחרי ה-useMemo של `emptySlots` (המסתיים ב-`}, [schedule]);` ~שורה 896), הוסף:

```tsx
  // אזהרה לפני פעולות "כלפי חוץ" כשיש משבצות ריקות - הפעולה נשמרת ורצה רק אחרי אישור
  const [pendingExportAction, setPendingExportAction] = useState<"publish" | "png" | "excel" | null>(null);

  const exportActions = {
    publish: handlePublish,
    png:     handleExportToImage,
    excel:   handleExportToExcel,
  } as const;

  const guardEmptySlots = (action: "publish" | "png" | "excel") => {
    if (schedule && emptySlots > 0) setPendingExportAction(action);
    else exportActions[action]();
  };
```

- [ ] **Step 2: חיבור שלושת הכפתורים**

בכפתור הפרסום (~שורה 1199) החלף `onClick={handlePublish}` ב-`onClick={() => guardEmptySlots("publish")}`.
בכפתור PNG (~שורה 1286) החלף `onClick={handleExportToImage}` ב-`onClick={() => guardEmptySlots("png")}`.
בכפתור Excel (~שורה 1289) החלף `onClick={handleExportToExcel}` ב-`onClick={() => guardEmptySlots("excel")}`.

- [ ] **Step 3: הדיאלוג המשותף**

מיד אחרי סגירת ה-AlertDialog של מחיקת-העמדה (`</AlertDialog>` ~שורה 1469), הוסף:

```tsx
      {/* Empty slots warning before publish/export */}
      <AlertDialog open={pendingExportAction !== null} onOpenChange={open => { if (!open) setPendingExportAction(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>יש {emptySlots} משבצות ריקות בשיבוץ</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingExportAction === "publish"
                ? "השיבוץ יפורסם לצוות עם המשבצות הריקות. להמשיך?"
                : "הקובץ ייווצא עם המשבצות הריקות. להמשיך?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => { if (pendingExportAction) exportActions[pendingExportAction](); setPendingExportAction(null); }}
            >
              המשך בכל זאת
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: שערים**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`
Expected: tsc נקי · 71/71 · lint 0 שגיאות / 10 אזהרות baseline · build מצליח.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: אזהרת משבצות-ריקות לפני פרסום/ייצוא (בקלוג #9)"
```

---

### Task 2: עדכון מדריך המשתמש (md + PDF)

**Files:**
- Modify: `public/user-guide.md`
- Regenerate: `public/user-guide.pdf`

- [ ] **Step 1: הוספת משפט למדריך**

קרא את `public/user-guide.md` ואתר את סעיף "### ייצוא" (בפרק "לשונית השיבוץ", ~שורה 163). הוסף בסוף הסעיף:

```markdown
אם נשארו משבצות ריקות בשיבוץ, תוצג אזהרה לפני הפרסום או הייצוא - אפשר להמשיך בכל זאת או לחזור ולהשלים את השיבוץ.
```

- [ ] **Step 2: יצירת ה-PDF מחדש**

אותו תהליך כמו בפיצ'ר הקודם (ראה `docs/superpowers/plans/2026-07-18-additional-admin.md` Task 7 - תבנית ה-RTL והפקודות שם): `npx -y marked` להמרת גוף, עטיפה בתבנית RTL בתיקיית scratchpad (לא בריפו):

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; direction: rtl; max-width: 800px; margin: 2em auto; line-height: 1.6; }
  h1, h2, h3 { color: #0f766e; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
<!-- BODY -->
</body>
</html>
```

ואז Chrome headless:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf="C:\\Projects\\work_allocator\\work-allocator\\public\\user-guide.pdf" \
  "<נתיב ה-HTML המלא>"
```

- [ ] **Step 3: אימות ויזואלי** - קרא את ה-PDF, ודא שהמשפט מופיע בסעיף הייצוא, RTL תקין.

- [ ] **Step 4: Commit**

```bash
git add public/user-guide.md public/user-guide.pdf
git commit -m "docs: מדריך משתמש - אזהרת משבצות-ריקות לפני ייצוא/פרסום"
```

---

### Task 3: אינטגרציה (מתזמר בלבד)

- [ ] סקירת-ענף (Sonnet מספיק - diff קטן וללא SQL/אבטחה).
- [ ] מיזוג ff ל-main, push, מעקב פריסה ירוקה.
- [ ] אימות חי: יצירת שיבוץ עם משבצות ריקות בחשבון-בדיקה (או ארגון-הבדיקה מהזרם הקודם - נמחק, ליצור חדש ולנקות), לחיצה על פרסום - הדיאלוג מופיע, ביטול לא מפרסם, "המשך בכל זאת" מפרסם. ניקוי נתוני-בדיקה.

## Self-Review (בוצע בכתיבה)

- **כיסוי spec:** state+שומר+שלושה כפתורים+דיאלוג (Task 1) · מדריך md+PDF (Task 2) · אימות חי (Task 3). אין פער.
- **עקביות:** `exportActions` ממופה לשלושת ה-handlers הקיימים; הדיאלוג משתמש באותו state ובאותו מיפוי.
- **אין placeholders.**
- הערה: `guardEmptySlots` ו-`exportActions` מוגדרים אחרי ה-handlers (שורות 247, 837-870) כך שאין בעיית סדר הגדרות.
