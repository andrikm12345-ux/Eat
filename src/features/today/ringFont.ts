/** Font size (px) that keeps a number inside the calorie ring: shorter numbers are bigger. */
export const ringFont = (text: string) => (text.length <= 5 ? 31 : text.length === 6 ? 24 : 18);
