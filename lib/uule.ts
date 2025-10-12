/**
 * Encode a location name as UULE (base64 city hint for Google)
 * Used for city-level geo-targeting
 * @param place - City/location name (e.g., "Mumbai, India")
 * @returns UULE-encoded string for Google Search
 */
export function encodeUULE(place: string): string {
  const b = Buffer.from(place, 'utf8').toString('base64');
  // Google expects "w+CAIQICI" prefix + base64 payload
  return `w+CAIQICI${b}`;
}
