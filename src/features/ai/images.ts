import type { ContentBlock } from '../../ai/client';
import { blobToBase64, compressImage } from '../../services/images';

/** Images for the API: longest side ≤ 1568 px, JPEG q = 0.8, base64. */
export async function toImageBlocks(files: File[]): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const f of files) {
    const blob = await compressImage(f, 1568, 0.8);
    out.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(blob) },
    });
  }
  return out;
}
