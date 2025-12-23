/**
 * Email Address Recognizer
 * RFC-like pattern with boundary awareness
 */

import { PIIType, SpanMatch, DetectionSource } from '../types/index.js';
import type { Recognizer } from './base.js';

/**
 * Email regex pattern
 * - Local part: alphanumeric, dots, underscores, hyphens, plus signs
 * - Domain: alphanumeric with dots and hyphens
 * - TLD: 2-10 characters
 * - Word boundaries to avoid matching code/variables
 */
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}\b/g;

/**
 * Email address recognizer
 */
export const emailRecognizer: Recognizer = {
  type: PIIType.EMAIL,
  name: 'Email Address',
  defaultConfidence: 0.98,

  find(text: string): SpanMatch[] {
    const matches: SpanMatch[] = [];
    const pattern = new RegExp(EMAIL_PATTERN.source, 'g');

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      const email = match[0];

      // Skip if it looks like code (contains multiple @ or unusual patterns)
      if (!this.validate!(email)) {
        continue;
      }

      matches.push({
        type: PIIType.EMAIL,
        start: match.index,
        end: match.index + email.length,
        confidence: this.defaultConfidence,
        source: DetectionSource.REGEX,
        text: email,
      });
    }

    return matches;
  },

  validate(email: string): boolean {
    // Basic validation
    if (email.length > 254) return false; // Max email length per RFC
    if (email.includes('..')) return false; // No consecutive dots

    const parts = email.split('@');
    if (parts.length !== 2) return false;

    const [local, domain] = parts;
    if (local === undefined || domain === undefined) return false;

    // Local part validation
    if (local.length === 0 || local.length > 64) return false;
    if (local.startsWith('.') || local.endsWith('.')) return false;

    // Domain validation
    if (domain.length === 0 || domain.length > 253) return false;
    if (!domain.includes('.')) return false;

    // Check for valid TLD (at least 2 chars)
    const tld = domain.split('.').pop();
    if (tld === undefined || tld.length < 2) return false;

    return true;
  },

  normalize(email: string): string {
    return email.toLowerCase().trim();
  },
};

