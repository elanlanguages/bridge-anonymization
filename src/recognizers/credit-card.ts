/**
 * Credit Card Number Recognizer
 * Detects major card types with Luhn checksum validation
 */

import { PIIType, SpanMatch, DetectionSource } from '../types/index.js';
import type { Recognizer } from './base.js';
import { validateLuhn } from '../utils/luhn.js';

/**
 * Credit card patterns for major card types
 * All patterns allow optional separators (spaces, dashes)
 */
const CARD_PATTERNS = {
  // Visa: 13 or 16 digits, starts with 4
  visa: /\b4[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{1,4}\b/g,

  // Mastercard: 16 digits, starts with 51-55 or 2221-2720
  mastercard:
    /\b(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,

  // American Express: 15 digits, starts with 34 or 37
  amex: /\b3[47][0-9]{2}[\s-]?[0-9]{6}[\s-]?[0-9]{5}\b/g,

  // Discover: 16 digits, starts with 6011, 644-649, 65
  discover:
    /\b(?:6011|64[4-9][0-9]|65[0-9]{2})[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,

  // Diners Club: 14 digits, starts with 36, 38, or 300-305
  diners: /\b(?:36[0-9]{2}|38[0-9]{2}|30[0-5][0-9])[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{2}\b/g,

  // JCB: 16 digits, starts with 3528-3589
  jcb: /\b35(?:2[89]|[3-8][0-9])[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,

  // Generic 16-digit pattern (fallback)
  generic: /\b[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
};

/**
 * Card type names for identification
 */
type CardType = keyof typeof CARD_PATTERNS;

/**
 * Credit card recognizer with Luhn validation
 */
export const creditCardRecognizer: Recognizer = {
  type: PIIType.CREDIT_CARD,
  name: 'Credit Card Number',
  defaultConfidence: 0.98,

  find(text: string): SpanMatch[] {
    const matches: SpanMatch[] = [];
    const seen = new Set<string>();

    // Try each card type pattern
    for (const [cardType, pattern] of Object.entries(CARD_PATTERNS)) {
      const globalPattern = new RegExp(pattern.source, 'g');

      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined) continue;

        const cardNumber = match[0];
        const key = `${match.index}:${match.index + cardNumber.length}`;

        if (seen.has(key)) continue;

        // Validate with Luhn checksum
        if (!this.validate!(cardNumber)) continue;

        // Skip generic matches that look like other number sequences
        if (cardType === 'generic' && !looksLikeCreditCard(cardNumber)) {
          continue;
        }

        seen.add(key);
        matches.push({
          type: PIIType.CREDIT_CARD,
          start: match.index,
          end: match.index + cardNumber.length,
          confidence: this.defaultConfidence,
          source: DetectionSource.REGEX,
          text: cardNumber,
        });
      }
    }

    // Remove overlapping matches
    return deduplicateOverlapping(matches);
  },

  validate(cardNumber: string): boolean {
    // Extract digits only
    const digits = cardNumber.replace(/\D/g, '');

    // Check length (13-19 digits)
    if (digits.length < 13 || digits.length > 19) {
      return false;
    }

    // Validate Luhn checksum
    if (!validateLuhn(digits)) {
      return false;
    }

    // Should not be all same digit
    if (/^(\d)\1+$/.test(digits)) {
      return false;
    }

    return true;
  },

  normalize(cardNumber: string): string {
    // Remove separators, return digits only
    return cardNumber.replace(/\D/g, '');
  },
};

/**
 * Additional heuristics for generic 16-digit sequences
 */
function looksLikeCreditCard(number: string): boolean {
  const digits = number.replace(/\D/g, '');

  // Check if it starts with a known card prefix
  const knownPrefixes = [
    '4', // Visa
    '5', // Mastercard
    '34',
    '37', // Amex
    '6011',
    '65', // Discover
    '36',
    '38', // Diners
    '35', // JCB
  ];

  for (const prefix of knownPrefixes) {
    if (digits.startsWith(prefix)) {
      return true;
    }
  }

  // If it has separators in a card-like format, probably a card
  if (/\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}/.test(number)) {
    return true;
  }

  return false;
}

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
      // Keep the one with higher confidence or longer match
      if (match.confidence > last.confidence || match.end - match.start > last.end - last.start) {
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
 * Identifies the card type from a card number
 */
export function identifyCardType(cardNumber: string): CardType | 'unknown' {
  const digits = cardNumber.replace(/\D/g, '');

  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2(?:2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720)/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(?:011|4[4-9]|5)/.test(digits)) return 'discover';
  if (/^3(?:6|8|0[0-5])/.test(digits)) return 'diners';
  if (/^35(?:2[89]|[3-8])/.test(digits)) return 'jcb';

  return 'unknown';
}

