/**
 * Password policy for account creation and password resets only.
 * Sign-in never re-validates: existing passwords predate this rule.
 */
export type PasswordRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "lower", label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "number", label: "One number", test: (v) => /[0-9]/.test(v) },
  {
    id: "special",
    label: "One special character (!@#$…)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export function passwordFailures(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

export function isPasswordValid(value: string): boolean {
  return passwordFailures(value).length === 0;
}

/** Single sentence suitable for an inline error under the submit button. */
export function passwordError(value: string): string | null {
  const failures = passwordFailures(value);
  if (failures.length === 0) return null;
  return `Password needs: ${failures.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
}
