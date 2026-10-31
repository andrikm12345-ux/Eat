import { expect, it } from 'vitest';
import { blobToBase64, fitSize } from './images';

it('fits images into the longest side', () => {
  expect(fitSize(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 });
  expect(fitSize(3000, 4000, 1568)).toEqual({ w: 1176, h: 1568 });
  expect(fitSize(800, 600, 1280)).toEqual({ w: 800, h: 600 });
});

it('encodes blobs as base64', async () => {
  expect(await blobToBase64(new Blob(['hello']))).toBe('aGVsbG8=');
});
