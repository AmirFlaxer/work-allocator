/**
 * פרמטר ?week=next - מגיע מהקישור במייל התזכורת השבועית, וגורם לאפליקציה
 * לקפוץ ליום ראשון הקרוב. לוגיקה טהורה כדי שתהיה בדיקה.
 */
export function hasNextWeekParam(search: string): boolean {
  return new URLSearchParams(search).get("week") === "next";
}

/** אותה מחרוזת בלי הפרמטר week - לניקוי ה-URL אחרי הקפיצה. */
export function stripWeekParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("week");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
