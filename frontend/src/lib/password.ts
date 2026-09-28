// Password strength checklist shown while registering. Only the length rules are enforced (they match the backend:
// 8 to 128 characters); the others are advice, following NIST SP 800-63B's "length over composition" guidance.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export interface PasswordCheck {
  label: string
  met: boolean
  required: boolean
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, met: password.length >= PASSWORD_MIN, required: true },
    { label: 'A number or a symbol', met: /[^A-Za-z]/.test(password), required: false },
    { label: 'Upper and lower case letters', met: /[a-z]/.test(password) && /[A-Z]/.test(password), required: false },
    { label: '16 characters or more (even better)', met: password.length >= 16, required: false },
  ]
}

export function passwordAcceptable(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX
}
