/**
 * Normalize text for deduplication and comparison
 * Preserves the core meaning while handling Unicode, quotes, and punctuation
 */
export const normalize = (s: string): string =>
  s.normalize('NFKC')
   .toLowerCase()
   .replace(/[""«»„"""']/g, '"')
   .replace(/[^\p{L}\p{N}\s?]/gu, ' ')
   .replace(/\s+/g, ' ')
   .trim();
