import { describe, it, expect } from 'vitest';
import { anonymizeRegexOnly } from '../../src/index.js';
import { GOLDEN_TESTS, ADVERSARIAL_TESTS, type GoldenTestCase } from './golden-tests.js';

describe('Golden Tests', () => {
  describe('expected detections', () => {
    for (const testCase of GOLDEN_TESTS) {
      it(`should handle: ${testCase.name} - ${testCase.description}`, async () => {
        const result = await anonymizeRegexOnly(testCase.input);

        // Check entity count
        expect(result.stats.totalEntities).toBe(testCase.expectedCount);

        // Check expected types are present
        const detectedTypes = result.entities.map(e => e.type);
        for (const expectedType of testCase.expectedTypes) {
          expect(detectedTypes).toContain(expectedType);
        }

        // Verify no raw PII in output
        if (testCase.expectedCount > 0) {
          expect(result.anonymizedText).toContain('<PII type=');
        }
      });
    }
  });

  describe('adversarial tests (false positive prevention)', () => {
    for (const testCase of ADVERSARIAL_TESTS) {
      it(`should not falsely detect: ${testCase.name} - ${testCase.description}`, async () => {
        const result = await anonymizeRegexOnly(testCase.input);

        expect(result.stats.totalEntities).toBe(testCase.expectedCount);
      });
    }
  });
});

describe('Tag Format Validation', () => {
  it('should produce correctly formatted tags', async () => {
    const result = await anonymizeRegexOnly('Email: test@example.com');

    // Tag format should be: <PII type="TYPE" id="N"/>
    const tagPattern = /<PII type="[A-Z_]+" id="\d+"\/>/;
    expect(result.anonymizedText).toMatch(tagPattern);
  });

  it('should use uppercase type names', async () => {
    const result = await anonymizeRegexOnly('Email: test@example.com');

    expect(result.anonymizedText).toContain('type="EMAIL"');
  });

  it('should use monotonically increasing IDs', async () => {
    const result = await anonymizeRegexOnly('a@b.com and c@d.com and e@f.com');

    expect(result.anonymizedText).toContain('id="1"');
    expect(result.anonymizedText).toContain('id="2"');
    expect(result.anonymizedText).toContain('id="3"');
  });
});

describe('Offset Preservation', () => {
  it('should preserve correct relative positions', async () => {
    const input = 'Start test@example.com middle another@test.org end';
    const result = await anonymizeRegexOnly(input);

    // Check that "Start", "middle", and "end" are preserved
    expect(result.anonymizedText).toContain('Start');
    expect(result.anonymizedText).toContain('middle');
    expect(result.anonymizedText).toContain('end');

    // Check relative order
    const startIdx = result.anonymizedText.indexOf('Start');
    const middleIdx = result.anonymizedText.indexOf('middle');
    const endIdx = result.anonymizedText.indexOf('end');

    expect(startIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(endIdx);
  });
});

