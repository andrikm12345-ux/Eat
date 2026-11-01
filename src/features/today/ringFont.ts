/** Font size (px) that keeps a number inside the calorie ring: shorter numbers are bigger. */
export const ringFont = (text: string) =>
  text.length <= 5 ? 30 : text.length === 6 ? 26 : text.length === 7 ? 22 : 18;
