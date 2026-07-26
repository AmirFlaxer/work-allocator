// מייצר את src/data/israeli-holidays.json - טבלת חגים וימי-ציון בישראל.
//
// ── למה קובץ סטטי ולא ספרייה בזמן-ריצה ──────────────────────────────────────
// היה כאן @hebcal/core, שהוא GPL-2.0 בלי חריג-קישור ונשלח לדפדפן של כל משתמש
// (chunk של 164KB). date-holidays מתירני (ISC + CC-BY-3.0) ומכסה את אותם ימים,
// אבל הוא מסד-חגים עולמי במשקל 11MB עם lodash ו-js-yaml - להחליף אליו בזמן-ריצה
// היה מגדיל את ה-bundle במקום להקטין. לכן הוא רץ כאן, בזמן-בנייה בלבד, והתוצר
// הוא 50KB JSON (‏7KB אחרי gzip) בלי שום ספרייה בקוד המופץ.
//
// ── הרצה (נדרשת אחת לכמה שנים, כשהכיסוי מתקרב לסופו) ────────────────────────
//   mkdir -p /tmp/holgen && cd /tmp/holgen && npm i date-holidays
//   DATE_HOLIDAYS_PATH=/tmp/holgen/node_modules/date-holidays/index.js \
//     node scripts/generate-holidays.mjs
//
// date-holidays אינו תלות של הפרויקט בכוונה - הוא 11MB שנחוצים אחת לעשור.
// הבדיקה ב-holidays.test.ts נכשלת כשהכיסוי מתקרב לסופו, כדי שזה לא יישכח.

import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const FIRST_YEAR = 2025;
const LAST_YEAR  = 2050;

const libPath = process.env.DATE_HOLIDAYS_PATH ?? "date-holidays";
let Holidays;
try {
  Holidays = (await import(libPath)).default;
} catch {
  console.error(
    "לא נמצא date-holidays.\n" +
    "  mkdir -p /tmp/holgen && cd /tmp/holgen && npm i date-holidays\n" +
    "  DATE_HOLIDAYS_PATH=/tmp/holgen/node_modules/date-holidays/index.js node scripts/generate-holidays.mjs"
  );
  process.exit(1);
}

const hd = new Holidays("IL");
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** @type {Record<string, [string, "strong" | "light"]>} */
const table = {};

for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
  for (const holiday of hd.getHolidays(year)) {
    const start = new Date(holiday.start);
    const end   = new Date(holiday.end);
    // type=public הוא יום שבו לא עובדים; school/observance הם ימי-ציון.
    const strong = holiday.type === "public";

    // ערב-חג: date-holidays מקודד את תחילת החג ב-18:00 מקומי בערב שלפניו,
    // ולכן תאריך-ההתחלה של הטווח *הוא* תאריך הערב. אומת מול @hebcal/core -
    // ערב פסח, ערב ראש השנה, ערב יום כיפור וערב שבועות יוצאים נכון.
    if (strong) {
      const erev = iso(start);
      // שם החג עשוי לכלול כמה שמות ("מימונה, שביעי של פסח") - לערב לוקחים את הראשון.
      if (!table[erev]) table[erev] = [`ערב ${holiday.name.split(",")[0].trim()}`, "light"];
    }

    // הטווח נספר מהיום שאחרי ההתחלה (ההתחלה היא הערב) ועד end ועד בכלל.
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1); d <= end; d.setDate(d.getDate() + 1)) {
      const key = iso(d);
      // חג-מלא גובר על ציון-קל שכבר נרשם לאותו יום (למשל ערב שנופל על יום-ציון).
      if (!table[key] || (strong && table[key][1] === "light")) {
        table[key] = [holiday.name, strong ? "strong" : "light"];
      }
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/data/israeli-holidays.json");
mkdirSync(dirname(outPath), { recursive: true });

const payload = {
  _source: "date-holidays (ISC AND CC-BY-3.0) - https://github.com/commenthol/date-holidays",
  _generatedBy: "scripts/generate-holidays.mjs",
  firstYear: FIRST_YEAR,
  lastYear: LAST_YEAR,
  days: table,
};
writeFileSync(outPath, JSON.stringify(payload), "utf8");

console.log(`נכתבו ${Object.keys(table).length} ימים (${FIRST_YEAR}-${LAST_YEAR}) אל ${outPath}`);
