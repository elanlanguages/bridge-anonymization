/**
 * Base Recognizer Interface
 * Defines the contract for all PII recognizers (regex-based)
 */

import { PIIType, SpanMatch, DetectionSource } from '../types/index.js';

/**
 * Base interface for all PII recognizers
 */
export interface Recognizer {
  /** The PII type this recognizer detects */
  readonly type: PIIType;

  /** Human-readable name for logging/debugging */
  readonly name: string;

  /** Default confidence score for matches (0.0 to 1.0) */
  readonly defaultConfidence: number;

  /**
   * Finds all matches of this PII type in the given text
   * @param text - The text to search
   * @returns Array of span matches
   */
  find(text: string): SpanMatch[];

  /**
   * Optional validation of a match (e.g., checksum validation)
   * @param match - The matched text
   * @returns true if the match is valid
   */
  validate?(match: string): boolean;

  /**
   * Optional normalization of a match for storage
   * @param match - The matched text
   * @returns Normalized version of the match
   */
  normalize?(match: string): string;
}

/**
 * Base class for regex-based recognizers
 */
export abstract class RegexRecognizer implements Recognizer {
  abstract readonly type: PIIType;
  abstract readonly name: string;
  readonly defaultConfidence: number = 0.95;

  /** Compiled regex pattern(s) for matching */
  protected abstract readonly patterns: RegExp[];

  /**
   * Finds all matches using the configured patterns
   */
  find(text: string): SpanMatch[] {
    const matches: SpanMatch[] = [];

    for (const pattern of this.patterns) {
      // Ensure pattern has global flag for matchAll
      const globalPattern = pattern.global
        ? pattern
        : new RegExp(pattern.source, pattern.flags + 'g');

      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined) continue;

        const matchText = match[0];

        // Skip if validation fails
        if (this.validate !== undefined && !this.validate(matchText)) {
          continue;
        }

        matches.push({
          type: this.type,
          start: match.index,
          end: match.index + matchText.length,
          confidence: this.defaultConfidence,
          source: DetectionSource.REGEX,
          text: matchText,
        });
      }
    }

    return this.deduplicateMatches(matches);
  }

  /**
   * Removes duplicate matches (same span matched by multiple patterns)
   */
  protected deduplicateMatches(matches: SpanMatch[]): SpanMatch[] {
    const seen = new Set<string>();
    const unique: SpanMatch[] = [];

    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }

    return unique;
  }

  /**
   * Default validation (always passes)
   * Override in subclasses for checksum validation etc.
   */
  validate?(match: string): boolean;

  /**
   * Default normalization (returns as-is)
   * Override in subclasses for specific normalization
   */
  normalize?(match: string): string;
}

/**
 * Configuration for a regex recognizer created from patterns
 */
export interface RegexRecognizerConfig {
  type: PIIType;
  name: string;
  patterns: RegExp[];
  defaultConfidence?: number;
  validate?: (match: string) => boolean;
  normalize?: (match: string) => string;
}

/**
 * Creates a simple regex recognizer from configuration
 */
export function createRegexRecognizer(config: RegexRecognizerConfig): Recognizer {
  return {
    type: config.type,
    name: config.name,
    defaultConfidence: config.defaultConfidence ?? 0.95,

    find(text: string): SpanMatch[] {
      const matches: SpanMatch[] = [];
      const seen = new Set<string>();

      for (const pattern of config.patterns) {
        const globalPattern = pattern.global
          ? pattern
          : new RegExp(pattern.source, pattern.flags + 'g');

        for (const match of text.matchAll(globalPattern)) {
          if (match.index === undefined) continue;

          const matchText = match[0];
          const key = `${match.index}:${match.index + matchText.length}`;

          if (seen.has(key)) continue;

          // Skip if validation fails
          if (config.validate !== undefined && !config.validate(matchText)) {
            continue;
          }

          seen.add(key);
          matches.push({
            type: config.type,
            start: match.index,
            end: match.index + matchText.length,
            confidence: config.defaultConfidence ?? 0.95,
            source: DetectionSource.REGEX,
            text: matchText,
          });
        }
      }

      return matches;
    },

    validate: config.validate,
    normalize: config.normalize,
  };
}

