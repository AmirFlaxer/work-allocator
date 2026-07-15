# פריסה אוטומטית ל-Vercel דרך GitHub Actions

תאריך: 2026-07-15
סטטוס: מאושר

## רקע ובעיה

היום פריסה לפרודקשן היא ידנית (`npx vercel --prod`) - כל שינוי דורש שהמפתח יזכור לפרוס בנפרד מה-push, ואין שער אוטומטי שמונע פריסת קוד שבור. הפרויקט משתמש כבר ב-Vercel (מחובר דרך `.vercel/project.json`, לא Git-linked - אין auto-deploy מובנה של Vercel).

## מטרה

כל push ל-`main` שעובר שער בדיקות (טיפוסים, lint, טסטים) נפרס אוטומטית לפרודקשן. קוד שנכשל בשער לא נפרס.

## עיצוב

### זרימה

1. Push/merge ל-`main` מפעיל workflow יחיד: `.github/workflows/deploy.yml`.
2. Job בודד (`deploy`) על `ubuntu-latest`:
   - `checkout` + `setup-node` (גרסה תואמת ל-`nodeVersion: "24.x"` המוגדר בפרויקט ב-Vercel).
   - `npm ci`.
   - שער בדיקות, ברצף עוצר-בכשל: `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` (vitest run).
   - אם הכל ירוק: פריסה עם Vercel CLI - `npx vercel pull`, `npx vercel build --prod`, `npx vercel deploy --prebuilt --prod`.
3. אם שלב כלשהו בשער נכשל - ה-job נעצר שם (ברירת המחדל של GitHub Actions), הפריסה לא רצה, והכשל מופיע אדום בלשונית Actions.

### הרשאות וסודות

- **Secret יחיד: `VERCEL_TOKEN`** - טוקן אישי מ-Vercel, מוגדר ב-Settings → Secrets and variables → Actions של הריפו.
- **`VERCEL_ORG_ID` ו-`VERCEL_PROJECT_ID`** - לא סודיים (כבר גלויים ב-`.vercel/project.json` שמצוי בריפו). מוגדרים כ-env ישירות ב-workflow: `team_eZUFYREhPKfITSZksM3QjEAp` / `prj_KcQKsvIRAJjm38CrG6tu3dj8kWDJ`.
- משתני הסביבה של האפליקציה עצמה (`VITE_SUPABASE_URL` וכו') כבר מוגדרים בפרויקט ב-Vercel Dashboard (Production) - `vercel pull` מושך אותם משם בזמן ה-build; אין צורך לשכפל אותם ל-GitHub secrets.

### הגנות

- `concurrency: { group: deploy-main, cancel-in-progress: true }` - אם נדחפים כמה commits ברצף, רק הריצה האחרונה משלימה; ריצות ישנות מבוטלות.
- `on: push: branches: [main]` בלבד - לא רץ על ענפי פיצ'ר או PR-ים (אין preview deployments בשלב הזה - מחוץ לתחולה).
- אין `--no-verify`/דילוג הוקים; הבדיקות שרצות ב-CI הן בדיוק אלו שרצות היום ידנית לפני push (`tsc`, `lint`, `vitest`).

### מגבלות ידועות (מחוץ לתחולה)

- אין preview deployment אוטומטי לענפי feature/PR - אם ירצה בעתיד, אפשר להוסיף job נפרד שרץ על `pull_request` עם `vercel deploy` (בלי `--prod`).
- commit אחרון לפני push עם `[skip ci]` בהודעה ידלג על כל ה-workflow (כולל הפריסה) - להימנע מכך בכוונה בלבד.

## קבצים

- יצירה: `.github/workflows/deploy.yml`
- אין שינוי בקוד האפליקציה.

## בדיקת קבלה

1. Push ל-main מפעיל את ה-workflow (נראה בלשונית Actions).
2. שלבי השער (tsc/lint/test) מוצגים ומצליחים.
3. הפריסה מצליחה ו-`work-allocator.vercel.app` מציג את הגרסה החדשה.
4. סימולציית כשל (למשל commit עם שגיאת lint זמנית בענף בדיקה) - מוודאים שה-deploy לא רץ כשהשער נכשל (לא לבצע על main בפועל; מספיק לוודא לוגית שהצעדים ברצף `run` נעצרים בכשל, שזו התנהגות ברירת המחדל של GitHub Actions).
