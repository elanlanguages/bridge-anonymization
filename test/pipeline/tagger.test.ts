import { describe, it, expect } from 'vitest';
import {
  tagEntities,
  generateTag,
  parseTag,
  extractTags,
  rehydrate,
  createPIIMapKey,
} from '../../src/pipeline/tagger.js';
import { PIIType, SpanMatch, DetectionSource, createDefaultPolicy } from '../../src/types/index.js';

describe('Tagger', () => {
  const defaultPolicy = createDefaultPolicy();

  describe('generateTag', () => {
    it('should generate correct tag format', () => {
      expect(generateTag(PIIType.PERSON, 1)).toBe('<PII type="PERSON" id="1"/>');
      expect(generateTag(PIIType.EMAIL, 42)).toBe('<PII type="EMAIL" id="42"/>');
    });
  });

  describe('parseTag', () => {
    it('should parse valid tags', () => {
      const result = parseTag('<PII type="PERSON" id="1"/>');
      expect(result).toEqual({ type: PIIType.PERSON, id: 1 });
    });

    it('should return null for invalid tags', () => {
      expect(parseTag('<PII type="INVALID" id="1"/>')).toBeNull();
      expect(parseTag('<PII type="PERSON"/>')).toBeNull();
      expect(parseTag('not a tag')).toBeNull();
    });
  });

  describe('tagEntities', () => {
    it('should replace single entity', () => {
      const text = 'Hello John Smith!';
      const matches: SpanMatch[] = [
        {
          type: PIIType.PERSON,
          start: 6,
          end: 16,
          confidence: 0.9,
          source: DetectionSource.NER,
          text: 'John Smith',
        },
      ];

      const result = tagEntities(text, matches, defaultPolicy);

      expect(result.anonymizedText).toBe('Hello <PII type="PERSON" id="1"/>!');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.id).toBe(1);
      expect(result.piiMap.get('PERSON_1')).toBe('John Smith');
    });

    it('should replace multiple entities', () => {
      const text = 'Email john@test.com or call +49123456789';
      const matches: SpanMatch[] = [
        {
          type: PIIType.EMAIL,
          start: 6,
          end: 19,
          confidence: 0.98,
          source: DetectionSource.REGEX,
          text: 'john@test.com',
        },
        {
          type: PIIType.PHONE,
          start: 28,
          end: 40,
          confidence: 0.9,
          source: DetectionSource.REGEX,
          text: '+49123456789',
        },
      ];

      const result = tagEntities(text, matches, defaultPolicy);

      expect(result.anonymizedText).toBe(
        'Email <PII type="EMAIL" id="1"/> or call <PII type="PHONE" id="2"/>'
      );
      expect(result.entities).toHaveLength(2);
      expect(result.piiMap.size).toBe(2);
    });

    it('should assign IDs in order of occurrence', () => {
      const text = 'A then B then C';
      const matches: SpanMatch[] = [
        { type: PIIType.PERSON, start: 0, end: 1, confidence: 0.9, source: DetectionSource.NER, text: 'A' },
        { type: PIIType.PERSON, start: 7, end: 8, confidence: 0.9, source: DetectionSource.NER, text: 'B' },
        { type: PIIType.PERSON, start: 14, end: 15, confidence: 0.9, source: DetectionSource.NER, text: 'C' },
      ];

      const result = tagEntities(text, matches, defaultPolicy);

      expect(result.entities[0]?.id).toBe(1);
      expect(result.entities[1]?.id).toBe(2);
      expect(result.entities[2]?.id).toBe(3);
    });

    it('should preserve correct offsets after replacement', () => {
      const text = 'Hello World!';
      const matches: SpanMatch[] = [];

      const result = tagEntities(text, matches, defaultPolicy);

      expect(result.anonymizedText).toBe('Hello World!');
      expect(result.entities).toHaveLength(0);
    });
  });

  describe('extractTags', () => {
    it('should extract all tags from text', () => {
      const text = 'Hello <PII type="PERSON" id="1"/> and <PII type="EMAIL" id="2"/>!';
      const tags = extractTags(text);

      expect(tags).toHaveLength(2);
      expect(tags[0]).toEqual({ type: PIIType.PERSON, id: 1, position: 6 });
      expect(tags[1]).toEqual({ type: PIIType.EMAIL, id: 2, position: 38 });
    });
  });

  describe('rehydrate', () => {
    it('should restore original text from anonymized text', () => {
      const originalText = 'Contact john@example.com for help';
      const matches: SpanMatch[] = [
        {
          type: PIIType.EMAIL,
          start: 8,
          end: 24,
          confidence: 0.98,
          source: DetectionSource.REGEX,
          text: 'john@example.com',
        },
      ];

      const { anonymizedText, piiMap } = tagEntities(originalText, matches, defaultPolicy);
      const rehydrated = rehydrate(anonymizedText, piiMap);

      expect(rehydrated).toBe(originalText);
    });

    it('should restore text with multiple entities', () => {
      const originalText = 'John at john@test.com called +49123456789';
      const matches: SpanMatch[] = [
        { type: PIIType.PERSON, start: 0, end: 4, confidence: 0.9, source: DetectionSource.NER, text: 'John' },
        { type: PIIType.EMAIL, start: 8, end: 21, confidence: 0.98, source: DetectionSource.REGEX, text: 'john@test.com' },
        { type: PIIType.PHONE, start: 29, end: 41, confidence: 0.9, source: DetectionSource.REGEX, text: '+49123456789' },
      ];

      const { anonymizedText, piiMap } = tagEntities(originalText, matches, defaultPolicy);
      const rehydrated = rehydrate(anonymizedText, piiMap);

      expect(rehydrated).toBe(originalText);
    });
  });

  describe('createPIIMapKey', () => {
    it('should create correct key format', () => {
      expect(createPIIMapKey(PIIType.PERSON, 1)).toBe('PERSON_1');
      expect(createPIIMapKey(PIIType.EMAIL, 42)).toBe('EMAIL_42');
    });
  });
});

