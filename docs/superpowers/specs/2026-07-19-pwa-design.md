# PWA - עיצוב (בקלוג #7)

**תאריך:** 2026-07-19
**סטטוס:** מאושר ע"י אמיר

## מהות

הפיכת האתר ל-Progressive Web App להתקנה על מסך הבית, באותו דפוס שעבד ב-rental_journal
(sw.js ידני + manifest + אייקונים - בלי תלות חדשה, בלי plugin), ובלי push.

## רכיבים

1. **`public/manifest.json`** (סטטי - Vite, אין route דינמי):
   - name: "מחלק עבודה שבועי" · short_name: "שיבוץ" · description כמו index.html
   - start_url: "/" · display: "standalone" · orientation: "portrait-primary"
   - dir: "rtl" · lang: "he"
   - theme_color / background_color: מערכי העיצוב ב-index.css (הגוון שמשמש את ה-header/רקע;
     הערך המדויק ייקבע במימוש מתוך משתני ה-CSS הקיימים, מצב בהיר)
   - icons: icon-192.png (any) + icon-512.png (maskable) + logo.svg (any/svg)
2. **אייקונים**: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
   (180x180) - רינדור חד-פעמי של `public/logo.svg` הקיים (Chrome headless screenshot או
   npx sharp-cli - מה שזמין). ל-maskable: ריווח בטוח סביב הלוגו (הלוגו ~80% מהקנבס).
3. **`public/sw.js`**: הדפוס של rental_journal ללא בלוק ה-push/notificationclick:
   - install: precache של האייקונים + skipWaiting
   - activate: מחיקת caches ישנים + clients.claim
   - fetch: GET בלבד, network-first; שמירה ב-cache רק לתגובות תקינות של נכסים סטטיים
     (סיומות js/css/png/svg/woff2?) - קריאות Supabase לעולם לא נשמרות
   - שם cache עם גרסה: `work-allocator-v1`
4. **רישום ב-`src/main.tsx`**: `navigator.serviceWorker.register("/sw.js")` תחת
   `import.meta.env.PROD && "serviceWorker" in navigator` (לא מפריע לפיתוח מקומי).
5. **`index.html`**: `<link rel="manifest">`, `<meta name="theme-color">`,
   `<link rel="apple-touch-icon">`.

## אימות

- build ירוק; בפרודקשן: manifest נטען בלי שגיאות (DevTools/Playwright request), SW נרשם
  (navigator.serviceWorker.ready), האפליקציה עדיין עובדת רגיל.
- עדכון קצר במדריך המשתמש (סעיף חדש קטן: התקנה על מסך הבית) + PDF.

## מחוץ לתחום (YAGNI)

- התראות push · offline מלא לנתוני שיבוץ · prompt התקנה מותאם-אישית.
