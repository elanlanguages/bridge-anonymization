/**
 * URL Recognizer
 * Detects URLs with various protocols
 */

import { PIIType, SpanMatch, DetectionSource } from '../types/index.js';
import type { Recognizer } from './base.js';

/**
 * URL pattern - matches common URL formats
 * Supports: http, https, ftp, mailto, file protocols
 */
const URL_PATTERN =
  /\b(?:https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]*[-A-Za-z0-9+&@#/%=~_|]/g;

/**
 * Pattern for URLs without explicit protocol (www.)
 */
const WWW_PATTERN = /\bwww\.[-A-Za-z0-9+&@#/%?=~_|!:,.;]*[-A-Za-z0-9+&@#/%=~_|]/g;

/**
 * Pattern for mailto: URLs
 */
const MAILTO_PATTERN =
  /\bmailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * URL recognizer
 */
export const urlRecognizer: Recognizer = {
  type: PIIType.URL,
  name: 'URL',
  defaultConfidence: 0.92,

  find(text: string): SpanMatch[] {
    const matches: SpanMatch[] = [];
    const seen = new Set<string>();

    const patterns = [URL_PATTERN, WWW_PATTERN, MAILTO_PATTERN];

    for (const pattern of patterns) {
      const globalPattern = new RegExp(pattern.source, 'g');

      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined) continue;

        const url = match[0];
        const key = `${match.index}:${match.index + url.length}`;

        if (seen.has(key)) continue;
        if (!this.validate!(url)) continue;

        seen.add(key);
        matches.push({
          type: PIIType.URL,
          start: match.index,
          end: match.index + url.length,
          confidence: this.defaultConfidence,
          source: DetectionSource.REGEX,
          text: url,
        });
      }
    }

    // Remove overlapping matches (www. might be substring of http://www.)
    return deduplicateOverlapping(matches);
  },

  validate(url: string): boolean {
    // Basic length check
    if (url.length < 5) return false;

    // Should have at least one dot after the protocol
    const withoutProtocol = url.replace(/^(?:https?|ftp|file|mailto):\/\/?/, '');
    if (!withoutProtocol.includes('.')) return false;

    // TLD should be at least 2 characters
    const parts = withoutProtocol.split('.');
    const tld = parts[parts.length - 1];
    if (tld === undefined) return false;
    // Remove any path/query from TLD
    const cleanTld = tld.split(/[/?#]/)[0];
    if (cleanTld === undefined || cleanTld.length < 2) return false;

    return true;
  },

  normalize(url: string): string {
    return url.trim();
  },
};

/**
 * Remove overlapping matches
 */
function deduplicateOverlapping(matches: SpanMatch[]): SpanMatch[] {
  if (matches.length <= 1) return matches;

  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const result: SpanMatch[] = [];

  for (const match of sorted) {
    const last = result[result.length - 1];

    if (last !== undefined && match.start < last.end) {
      // Overlapping - keep the longer one
      if (match.end > last.end) {
        result.pop();
        result.push(match);
      }
    } else {
      result.push(match);
    }
  }

  return result;
}

/**
 * Extracts the domain from a URL
 */
export function extractDomain(url: string): string | null {
  try {
    // Add protocol if missing for URL parsing
    let normalizedUrl = url;
    if (url.startsWith('www.')) {
      normalizedUrl = 'https://' + url;
    }
    if (!normalizedUrl.includes('://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    const parsed = new URL(normalizedUrl);
    return parsed.hostname;
  } catch {
    return null;
  }
}

