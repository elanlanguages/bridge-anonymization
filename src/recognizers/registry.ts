/**
 * Recognizer Registry
 * Central registry for all PII recognizers
 */

import { PIIType, SpanMatch, AnonymizationPolicy } from '../types/index.js';
import type { Recognizer } from './base.js';

/**
 * Registry for managing PII recognizers
 */
export class RecognizerRegistry {
  private recognizers: Map<PIIType, Recognizer[]> = new Map();

  /**
   * Registers a recognizer for a PII type
   */
  register(recognizer: Recognizer): void {
    const existing = this.recognizers.get(recognizer.type) ?? [];
    existing.push(recognizer);
    this.recognizers.set(recognizer.type, existing);
  }

  /**
   * Registers multiple recognizers
   */
  registerAll(recognizers: Recognizer[]): void {
    for (const recognizer of recognizers) {
      this.register(recognizer);
    }
  }

  /**
   * Gets all recognizers for a specific type
   */
  getRecognizers(type: PIIType): Recognizer[] {
    return this.recognizers.get(type) ?? [];
  }

  /**
   * Gets all registered recognizers
   */
  getAllRecognizers(): Recognizer[] {
    const all: Recognizer[] = [];
    for (const recognizers of this.recognizers.values()) {
      all.push(...recognizers);
    }
    return all;
  }

  /**
   * Gets all registered PII types
   */
  getRegisteredTypes(): PIIType[] {
    return Array.from(this.recognizers.keys());
  }

  /**
   * Checks if a recognizer is registered for a type
   */
  hasRecognizer(type: PIIType): boolean {
    const recognizers = this.recognizers.get(type);
    return recognizers !== undefined && recognizers.length > 0;
  }

  /**
   * Removes all recognizers for a type
   */
  unregister(type: PIIType): void {
    this.recognizers.delete(type);
  }

  /**
   * Clears all recognizers
   */
  clear(): void {
    this.recognizers.clear();
  }

  /**
   * Runs all enabled recognizers on text and returns matches
   * @param text - Text to analyze
   * @param policy - Anonymization policy to determine which types to detect
   */
  findAll(text: string, policy: AnonymizationPolicy): SpanMatch[] {
    const matches: SpanMatch[] = [];

    for (const [type, recognizers] of this.recognizers) {
      // Skip types not enabled in policy
      if (!policy.enabledTypes.has(type) || !policy.regexEnabledTypes.has(type)) {
        continue;
      }

      // Get confidence threshold for this type
      const threshold = policy.confidenceThresholds.get(type) ?? 0.5;

      for (const recognizer of recognizers) {
        const typeMatches = recognizer.find(text);

        // Filter by confidence threshold
        for (const match of typeMatches) {
          if (match.confidence >= threshold) {
            matches.push(match);
          }
        }
      }
    }

    return matches;
  }
}

/**
 * Global singleton registry instance
 */
let globalRegistry: RecognizerRegistry | null = null;

/**
 * Gets the global recognizer registry (singleton)
 */
export function getGlobalRegistry(): RecognizerRegistry {
  if (globalRegistry === null) {
    globalRegistry = new RecognizerRegistry();
  }
  return globalRegistry;
}

/**
 * Creates a new isolated registry (useful for testing)
 */
export function createRegistry(): RecognizerRegistry {
  return new RecognizerRegistry();
}

