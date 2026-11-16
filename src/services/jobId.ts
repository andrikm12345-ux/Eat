/**
 * The same text always gets the same id (cyrb53), so a repeated request finds its reply.
 */
export function jobIdFor(text: string): string {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `d-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}-${s.length}`;
}
