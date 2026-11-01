import type { ContentBlock } from '../ai/client';
import { runAi } from '../ai/run';
import type { Valid } from '../ai/validators';
import type { Repos } from '../db/repos';
import { isValidEan } from '../domain/ean';

export const PROMPT_BARCODE = `На фото упаковка товара со штрихкодом. Прочитай цифры, напечатанные под штрихкодом (EAN-13, EAN-8 или UPC-A). Не придумывай цифры: если не видно или не уверен, верни null. Верни только JSON без пояснений и без markdown: {"code": "только цифры без пробелов" | null}`;

export function validateBarcode(data: unknown): Valid<{ code: string | null }> {
  if (typeof data !== 'object' || data === null) return { ok: false, errors: ['корень: объект'] };
  const code = (data as { code?: unknown }).code;
  if (code === null || code === undefined) return { ok: true, value: { code: null } };
  if (typeof code !== 'string' && typeof code !== 'number')
    return { ok: false, errors: ['code: строка с цифрами или null'] };
  return { ok: true, value: { code: String(code).replace(/\D/g, '') || null } };
}

/**
 * Asks the vision AI to read the digits under a barcode on a photo. The answer counts only
 * if its check digit is right, so a misread number never turns into a wrong product.
 */
export async function readBarcodeDigits(r: Repos, images: ContentBlock[]): Promise<string | null> {
  try {
    const { value } = await runAi(r, {
      kind: 'photo',
      vision: true,
      system: PROMPT_BARCODE,
      content: [...images, { type: 'text', text: 'Прочитай цифры штрихкода.' }],
      validate: validateBarcode,
    });
    return value.code && isValidEan(value.code) ? value.code : null;
  } catch {
    return null;
  }
}
