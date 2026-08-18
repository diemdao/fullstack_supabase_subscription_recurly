// Lightweight client-side validation for the auth flows. These run before we
// ever hit the network so users get instant feedback; Supabase remains the
// source of truth and its errors are surfaced on top of these.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean =>
  EMAIL_REGEX.test(email.trim());

/** Returns a human-readable error, or null when the email is acceptable. */
export const emailError = (email: string): string | null => {
  if (!email.trim()) return "Email is required";
  if (!isValidEmail(email)) return "Enter a valid email address";
  return null;
};

/** Returns a human-readable error, or null when the name is acceptable. */
export const nameError = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.length < 2) return "Enter at least 2 characters";
  if (trimmed.length > 60) return "Name must be 60 characters or fewer";
  return null;
};

/** Returns a human-readable error, or null when the password is acceptable. */
export const passwordError = (password: string): string | null => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
};

/** Returns a human-readable error, or null when the code looks well-formed. */
export const codeError = (code: string): string | null => {
  if (!code.trim()) return "Enter the verification code";
  if (!/^\d{8}$/.test(code.trim())) return "The code should be 8 digits";
  return null;
};
