export function normalizeBusinessRegistrationNumber(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

export function isValidBusinessRegistrationNumber(value: string | null | undefined) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (!/^\d{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + weight * numbers[index], 0)
    + Math.floor(numbers[8] * 5 / 10);
  return (10 - (sum % 10)) % 10 === numbers[9];
}
