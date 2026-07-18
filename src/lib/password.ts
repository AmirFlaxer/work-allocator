/** כללי חוזק סיסמה משותפים למסך ההרשמה ולעמוד ההצטרפות. */
export const PASSWORD_RULES = [
  { id: "length",    label: "לפחות 8 תווים",          test: (p: string) => p.length >= 8 },
  { id: "upper",     label: "אות גדולה באנגלית (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower",     label: "אות קטנה באנגלית (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { id: "digits",    label: "לפחות 2 ספרות",           test: (p: string) => (p.match(/\d/g) ?? []).length >= 2 },
  { id: "symbols",   label: "לפחות 2 סימנים (!@#...)", test: (p: string) => (p.match(/[^A-Za-z0-9]/g) ?? []).length >= 2 },
];

export function isPasswordValid(p: string) {
  return PASSWORD_RULES.every(r => r.test(p));
}
