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
