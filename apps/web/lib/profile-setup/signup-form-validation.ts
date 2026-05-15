/**
 * Validation for the consolidated A2 signup form.
 * KG IS CANONICAL: weight is captured in kilograms (20-300 range).
 */

export interface SignupFormValues {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "M" | "F" | "";
  weightKg: string;
  city: string;
  gymId: string;
}

export const EMPTY_SIGNUP_VALUES: SignupFormValues = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  weightKg: "",
  city: "",
  gymId: "",
};

export function isAtLeast16(isoDate: string): boolean {
  if (!isoDate) return false;
  const dob = new Date(isoDate);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const sixteenAgo = new Date(
    now.getFullYear() - 16,
    now.getMonth(),
    now.getDate(),
  );
  return dob.getTime() <= sixteenAgo.getTime();
}

export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isPasswordValid(password: string): boolean {
  return password.length >= 8;
}

export function isWeightKgValid(weightKg: string): boolean {
  const n = parseFloat(weightKg);
  return Number.isFinite(n) && n >= 20 && n <= 300;
}

export function validateSignupForm(values: SignupFormValues): {
  valid: boolean;
  error: string | null;
} {
  if (!isEmailValid(values.email)) {
    return { valid: false, error: "Enter a valid email address." };
  }
  if (!isPasswordValid(values.password)) {
    return { valid: false, error: "Password must be at least 8 characters." };
  }
  if (!values.firstName.trim() || !values.lastName.trim()) {
    return { valid: false, error: "First and last name are required." };
  }
  if (!values.dateOfBirth || !isAtLeast16(values.dateOfBirth)) {
    return { valid: false, error: "You must be at least 16 years old." };
  }
  if (values.gender !== "M" && values.gender !== "F") {
    return { valid: false, error: "Select a gender." };
  }
  if (!isWeightKgValid(values.weightKg)) {
    return { valid: false, error: "Enter a valid weight in kilograms (20-300)." };
  }
  if (!values.city.trim()) {
    return { valid: false, error: "Select a city." };
  }
  if (!values.gymId) {
    return { valid: false, error: "Select a home gym." };
  }
  return { valid: true, error: null };
}
