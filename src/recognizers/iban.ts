/**
 * IBAN Recognizer
 * International Bank Account Number with mod-97 checksum validation
 */

import { PIIType, SpanMatch, DetectionSource } from '../types/index.js';
import type { Recognizer } from './base.js';
import { validateIBAN, normalizeIBAN, IBAN_LENGTHS } from '../utils/iban-checksum.js';

/**
 * IBAN pattern - matches standard format with optional spaces
 * Format: 2 letters (country) + 2 digits (check) + 11-30 alphanumeric (BBAN)
 */
const IBAN_PATTERN =
  /\b[A-Z]{2}[0-9]{2}[\s]?(?:[A-Z0-9]{4}[\s]?){2,7}[A-Z0-9]{1,4}\b/gi;

/**
 * More permissive pattern for IBANs with various separators
 */
const IBAN_PATTERN_WITH_SEPARATORS =
  /\b[A-Z]{2}[0-9]{2}[\s.-]?(?:[A-Z0-9]{4}[\s.-]?){2,7}[A-Z0-9]{1,4}\b/gi;

/**
 * IBAN recognizer with checksum validation
 */
export const ibanRecognizer: Recognizer = {
  type: PIIType.IBAN,
  name: 'IBAN',
  defaultConfidence: 0.99, // High confidence when checksum passes

  find(text: string): SpanMatch[] {
    const matches: SpanMatch[] = [];
    const seen = new Set<string>();

    // Try both patterns
    const patterns = [IBAN_PATTERN, IBAN_PATTERN_WITH_SEPARATORS];

    for (const pattern of patterns) {
      const globalPattern = new RegExp(pattern.source, 'gi');

      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined) continue;

        const iban = match[0];
        const key = `${match.index}:${match.index + iban.length}`;

        if (seen.has(key)) continue;

        // Validate with checksum
        if (!this.validate!(iban)) continue;

        seen.add(key);
        matches.push({
          type: PIIType.IBAN,
          start: match.index,
          end: match.index + iban.length,
          confidence: this.defaultConfidence,
          source: DetectionSource.REGEX,
          text: iban,
        });
      }
    }

    return matches;
  },

  validate(iban: string): boolean {
    // Use the full IBAN validation with mod-97 checksum
    return validateIBAN(iban);
  },

  normalize(iban: string): string {
    return normalizeIBAN(iban);
  },
};

/**
 * Gets expected IBAN length for a country code
 */
export function getExpectedIBANLength(countryCode: string): number | undefined {
  return IBAN_LENGTHS[countryCode.toUpperCase()];
}

