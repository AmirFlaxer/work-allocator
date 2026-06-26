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
    // text L=29% keeps all 12 hues at WCAG AA contrast (>=4.5:1) on the L=89% bg
    bg: `hsl(${hue} 44% 89%)`,
    text: `hsl(${hue} 45% 29%)`,
    accent: `hsl(${hue} 48% 46%)`,
  };
}
