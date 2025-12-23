/**
 * Character Offset Utilities
 * Handles character offset calculations for text manipulation
 */

import type { SpanMatch } from '../types/index.js';

/**
 * Checks if two spans overlap
 */
export function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Checks if span A contains span B
 */
export function spanContains(outer: { start: number; end: number }, inner: { start: number; end: number }): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

/**
 * Gets the length of a span
 */
export function spanLength(span: { start: number; end: number }): number {
  return span.end - span.start;
}

/**
 * Extracts text for a span from the original text
 */
export function getSpanText(text: string, span: { start: number; end: number }): string {
  return text.slice(span.start, span.end);
}

/**
 * Sorts spans by start position (ascending) then by length (descending)
 */
export function sortSpansByPosition<T extends { start: number; end: number }>(spans: T[]): T[] {
  return [...spans].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    // For same start, longer spans first
    return spanLength(b) - spanLength(a);
  });
}

/**
 * Sorts spans by start position descending (for replacement operations)
 */
export function sortSpansByPositionDescending<T extends { start: number; end: number }>(spans: T[]): T[] {
  return [...spans].sort((a, b) => b.start - a.start);
}

/**
 * Removes overlapping spans, keeping the preferred ones based on a comparator
 * @param spans - Array of spans to deduplicate
 * @param prefer - Comparator that returns positive if 'a' should be preferred over 'b'
 */
export function removeOverlappingSpans<T extends SpanMatch>(
  spans: T[],
  prefer: (a: T, b: T) => number
): T[] {
  if (spans.length === 0) {
    return [];
  }

  // Sort by start position
  const sorted = sortSpansByPosition(spans);
  const result: T[] = [];

  for (const span of sorted) {
    // Check if this span overlaps with any already-selected span
    let shouldAdd = true;
    let indexToRemove: number | null = null;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i]!;

      if (spansOverlap(span, existing)) {
        // Determine which to keep
        const preference = prefer(span, existing);

        if (preference > 0) {
          // New span is preferred, mark old one for removal
          indexToRemove = i;
        } else {
          // Existing span is preferred, don't add new one
          shouldAdd = false;
        }
        break;
      }
    }

    if (indexToRemove !== null) {
      result.splice(indexToRemove, 1);
    }

    if (shouldAdd) {
      result.push(span);
    }
  }

  return sortSpansByPosition(result);
}

/**
 * Validates that spans don't overlap (for final validation)
 */
export function validateNoOverlaps(spans: { start: number; end: number }[]): boolean {
  const sorted = sortSpansByPosition(spans);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;

    if (current.end > next.start) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates offset adjustments for replacements
 * Used when you need to map positions between original and modified text
 */
export interface OffsetAdjustment {
  originalStart: number;
  originalEnd: number;
  newStart: number;
  newEnd: number;
  delta: number; // newLength - originalLength
}

/**
 * Builds a list of offset adjustments from replacements
 */
export function buildOffsetAdjustments(
  replacements: Array<{ start: number; end: number; replacement: string }>
): OffsetAdjustment[] {
  const sorted = sortSpansByPosition(replacements);
  const adjustments: OffsetAdjustment[] = [];
  let cumulativeDelta = 0;

  for (const rep of sorted) {
    const originalLength = rep.end - rep.start;
    const newLength = rep.replacement.length;
    const delta = newLength - originalLength;

    adjustments.push({
      originalStart: rep.start,
      originalEnd: rep.end,
      newStart: rep.start + cumulativeDelta,
      newEnd: rep.start + cumulativeDelta + newLength,
      delta,
    });

    cumulativeDelta += delta;
  }

  return adjustments;
}

