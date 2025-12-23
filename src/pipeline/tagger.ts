/**
 * Replacement Tagger
 * Replaces PII spans with placeholder tags and builds the PII map
 */

import {
  PIIType,
  SpanMatch,
  DetectedEntity,
  DetectionSource,
  AnonymizationPolicy,
} from '../types/index.js';
import { sortSpansByPosition, sortSpansByPositionDescending } from '../utils/offsets.js';

/**
 * PII Map entry (before encryption)
 */
export interface PIIMapEntry {
  /** PII type */
  type: PIIType;
  /** Entity ID */
  id: number;
  /** Original text */
  original: string;
}

/**
 * Raw PII Map (before encryption)
 */
export type RawPIIMap = Map<string, string>;

/**
 * Tagging result
 */
export interface TaggingResult {
  /** Anonymized text with placeholder tags */
  anonymizedText: string;
  /** List of detected entities with assigned IDs */
  entities: DetectedEntity[];
  /** Raw PII map (type_id -> original) */
  piiMap: RawPIIMap;
}

/**
 * Generates a PII placeholder tag
 * Format: <PII type="TYPE" id="N"/>
 */
export function generateTag(type: PIIType, id: number): string {
  return `<PII type="${type}" id="${id}"/>`;
}

/**
 * Parses a PII tag to extract type and id
 * Returns null if not a valid tag
 */
export function parseTag(tag: string): { type: PIIType; id: number } | null {
  const match = tag.match(/^<PII\s+type="([A-Z_]+)"\s+id="(\d+)"\s*\/>$/);
  if (match === null) {
    return null;
  }

  const [, typeStr, idStr] = match;
  if (typeStr === undefined || idStr === undefined) {
    return null;
  }

  const type = typeStr as PIIType;
  const id = parseInt(idStr, 10);

  // Validate type is a valid PIIType
  if (!Object.values(PIIType).includes(type)) {
    return null;
  }

  return { type, id };
}

/**
 * Creates a key for the PII map
 */
export function createPIIMapKey(type: PIIType, id: number): string {
  return `${type}_${id}`;
}

/**
 * Tags PII spans in text and builds the PII map
 */
export function tagEntities(
  text: string,
  matches: SpanMatch[],
  policy: AnonymizationPolicy
): TaggingResult {
  if (matches.length === 0) {
    return {
      anonymizedText: text,
      entities: [],
      piiMap: new Map(),
    };
  }

  // Sort by start position ascending for ID assignment
  const sortedAscending = sortSpansByPosition(matches);

  // Assign IDs
  const entitiesWithIds: Array<SpanMatch & { id: number }> = [];
  let nextId = 1;

  // Track seen text for ID reuse (if enabled)
  const seenText = new Map<string, number>(); // text -> id

  for (const match of sortedAscending) {
    let id: number;

    if (policy.reuseIdsForRepeatedPII) {
      const key = `${match.type}:${match.text}`;
      const existingId = seenText.get(key);
      if (existingId !== undefined) {
        id = existingId;
      } else {
        id = nextId++;
        seenText.set(key, id);
      }
    } else {
      id = nextId++;
    }

    entitiesWithIds.push({ ...match, id });
  }

  // Build PII map
  const piiMap: RawPIIMap = new Map();
  for (const entity of entitiesWithIds) {
    const key = createPIIMapKey(entity.type, entity.id);
    piiMap.set(key, entity.text);
  }

  // Sort by start position descending for replacement
  // (replacing from end to start preserves earlier offsets)
  const sortedDescending = [...entitiesWithIds].sort((a, b) => b.start - a.start);

  // Perform replacements
  let anonymizedText = text;
  for (const entity of sortedDescending) {
    const tag = generateTag(entity.type, entity.id);
    anonymizedText =
      anonymizedText.slice(0, entity.start) + tag + anonymizedText.slice(entity.end);
  }

  // Build final entities list (sorted by position)
  const entities: DetectedEntity[] = entitiesWithIds.map((e) => ({
    type: e.type,
    id: e.id,
    start: e.start,
    end: e.end,
    confidence: e.confidence,
    source: e.source,
    original: e.text,
  }));

  return {
    anonymizedText,
    entities: sortSpansByPosition(entities) as DetectedEntity[],
    piiMap,
  };
}

/**
 * Validates that a tag is well-formed
 */
export function isValidTag(tag: string): boolean {
  return parseTag(tag) !== null;
}

/**
 * Extracts all PII tags from anonymized text
 */
export function extractTags(anonymizedText: string): Array<{ type: PIIType; id: number; position: number }> {
  const tags: Array<{ type: PIIType; id: number; position: number }> = [];
  const tagPattern = /<PII\s+type="([A-Z_]+)"\s+id="(\d+)"\s*\/>/g;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(anonymizedText)) !== null) {
    const typeStr = match[1];
    const idStr = match[2];

    if (typeStr !== undefined && idStr !== undefined) {
      const type = typeStr as PIIType;
      const id = parseInt(idStr, 10);

      if (Object.values(PIIType).includes(type)) {
        tags.push({ type, id, position: match.index });
      }
    }
  }

  return tags;
}

/**
 * Counts entities by type
 */
export function countEntitiesByType(entities: DetectedEntity[]): Record<PIIType, number> {
  const counts: Record<PIIType, number> = {} as Record<PIIType, number>;

  // Initialize all types to 0
  for (const type of Object.values(PIIType)) {
    counts[type] = 0;
  }

  // Count entities
  for (const entity of entities) {
    counts[entity.type] = (counts[entity.type] ?? 0) + 1;
  }

  return counts;
}

/**
 * Rehydrates anonymized text using the PII map
 * (For testing/debugging only - not part of the anonymization pipeline)
 */
export function rehydrate(anonymizedText: string, piiMap: RawPIIMap): string {
  let result = anonymizedText;
  const tags = extractTags(anonymizedText);

  // Sort by position descending for replacement
  tags.sort((a, b) => b.position - a.position);

  for (const { type, id, position } of tags) {
    const key = createPIIMapKey(type, id);
    const original = piiMap.get(key);

    if (original !== undefined) {
      const tag = generateTag(type, id);
      result = result.slice(0, position) + original + result.slice(position + tag.length);
    }
  }

  return result;
}

