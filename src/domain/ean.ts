/** Checksum of an EAN-13 / EAN-8 / UPC-A number (digits only). */
export function isValidEan(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  // From the right, the digit next to the check digit has weight 3, the next 1, and so on.
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
