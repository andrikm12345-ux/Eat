import type { ContentBlock } from '../../ai/client';
import { blobToBase64, compressImage } from '../../services/images';

/** Images for the API: longest side ≤ 1024 px, JPEG q = 0.75 (enough for food, and several photos upload and recognise much faster), base64. */
export async function toImageBlocks(files: File[]): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const f of files) {
    const blob = await compressImage(f, 1024, 0.75);
    out.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(blob) },
    });
  }
  return out;
}
