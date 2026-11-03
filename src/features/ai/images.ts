import type { ContentBlock } from '../../ai/client';
import { blobToBase64, compressImage } from '../../services/images';

/** Images for the API: longest side ≤ 1024 px (≤ 768 px when there are several photos), JPEG q = 0.72: enough for food, and a slow model reads far fewer image tokens, base64. */
export async function toImageBlocks(files: File[]): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const f of files) {
    const blob = await compressImage(f, files.length > 1 ? 768 : 1024, 0.72);
    out.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(blob) },
    });
  }
  return out;
}
