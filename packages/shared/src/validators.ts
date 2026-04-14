/**
 * Validates a Polish NIP (tax identification number).
 * Rules:
 * - exactly 10 digits
 * - checksum: digits 1-9 × weights [6,5,7,2,3,4,5,6,7], sum % 11 === digit 10
 * - if sum % 11 === 10 → invalid
 */
export function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const digits = nip.split('').map(Number);

  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const checkDigit = sum % 11;

  if (checkDigit === 10) return false;
  return checkDigit === digits[9];
}
