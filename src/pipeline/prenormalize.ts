/**
 * Pre-normalization
 * Normalizes text before PII detection
 */

/**
 * Pre-normalization options
 */
export interface PrenormalizeOptions {
  /** Normalize line endings to \n */
  normalizeLineEndings: boolean;
  /** Apply Unicode NFKC normalization */
  unicodeNormalize: boolean;
  /** Trim leading/trailing whitespace */
  trim: boolean;
}

/**
 * Default pre-normalization options
 */
export const DEFAULT_PRENORMALIZE_OPTIONS: PrenormalizeOptions = {
  normalizeLineEndings: true,
  unicodeNormalize: false, // Disabled by default to preserve offsets
  trim: false, // Disabled by default to preserve offsets
};

/**
 * Pre-normalizes text for PII detection
 * Note: This currently only normalizes line endings to preserve character offsets
 * 
 * @param text - Original input text
 * @param options - Normalization options
 * @returns Normalized text
 */
export function prenormalize(
  text: string,
  options: Partial<PrenormalizeOptions> = {}
): string {
  const opts = { ...DEFAULT_PRENORMALIZE_OPTIONS, ...options };
  let result = text;

  // Normalize line endings (\r\n -> \n, \r -> \n)
  if (opts.normalizeLineEndings) {
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  // Note: Unicode normalization (NFKC) can change string length
  // We skip it by default to preserve character offsets
  // If needed, implement offset mapping
  if (opts.unicodeNormalize) {
    result = result.normalize('NFKC');
  }

  if (opts.trim) {
    result = result.trim();
  }

  return result;
}

/**
 * Calculates offset adjustments when text is modified
 * Used when prenormalization changes text length
 */
export interface OffsetMapping {
  /** Map from original offset to normalized offset */
  toNormalized: (originalOffset: number) => number;
  /** Map from normalized offset to original offset */
  toOriginal: (normalizedOffset: number) => number;
}

/**
 * Creates an identity offset mapping (no changes)
 */
export function createIdentityMapping(): OffsetMapping {
  return {
    toNormalized: (offset) => offset,
    toOriginal: (offset) => offset,
  };
}

/**
 * Creates offset mapping for line ending normalization
 * This handles \r\n -> \n replacement
 */
export function createLineEndingMapping(originalText: string): OffsetMapping {
  // Find all \r\n positions
  const crlfPositions: number[] = [];
  for (let i = 0; i < originalText.length - 1; i++) {
    if (originalText[i] === '\r' && originalText[i + 1] === '\n') {
      crlfPositions.push(i);
    }
  }

  if (crlfPositions.length === 0) {
    return createIdentityMapping();
  }

  return {
    toNormalized(originalOffset: number): number {
      // Count how many \r\n pairs are before this offset
      let adjustment = 0;
      for (const pos of crlfPositions) {
        if (pos < originalOffset) {
          adjustment++;
        } else {
          break;
        }
      }
      return originalOffset - adjustment;
    },

    toOriginal(normalizedOffset: number): number {
      // Add back the removed \r characters
      let adjustment = 0;
      let currentNormalized = 0;

      for (const pos of crlfPositions) {
        if (currentNormalized + (pos - adjustment) <= normalizedOffset) {
          adjustment++;
          currentNormalized = pos - adjustment + 1;
        } else {
          break;
        }
      }

      return normalizedOffset + adjustment;
    },
  };
}

