import type { Device } from '@/types';

/**
 * Get the appropriate User-Agent string for mobile or desktop
 * Uses current Chrome versions for realistic SERP behavior
 */
export function uaFor(device: Device): string {
  return device === 'mobile'
    ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
}
