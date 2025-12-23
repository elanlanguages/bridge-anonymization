import { describe, it, expect } from 'vitest';
import { ibanRecognizer } from '../../src/recognizers/iban.js';
import { validateIBAN, normalizeIBAN } from '../../src/utils/iban-checksum.js';
import { PIIType } from '../../src/types/index.js';

describe('IBAN Recognizer', () => {
  describe('find', () => {
    it('should detect German IBAN', () => {
      // Valid German IBAN (checksum correct)
      const text = 'IBAN: DE89370400440532013000';
      const matches = ibanRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.type).toBe(PIIType.IBAN);
      expect(matches[0]?.text).toBe('DE89370400440532013000');
    });

    it('should detect IBAN with spaces', () => {
      const text = 'Transfer to DE89 3704 0044 0532 0130 00';
      const matches = ibanRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should detect French IBAN', () => {
      // Valid French IBAN
      const text = 'IBAN: FR7630006000011234567890189';
      const matches = ibanRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should not detect invalid IBAN (wrong checksum)', () => {
      // Invalid checksum
      const text = 'IBAN: DE00000000000000000000';
      const matches = ibanRecognizer.find(text);

      expect(matches).toHaveLength(0);
    });

    it('should provide correct offsets', () => {
      const text = 'Pay to DE89370400440532013000 please';
      const matches = ibanRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.start).toBe(7);
      expect(matches[0]?.end).toBe(29);
    });
  });

  describe('validate', () => {
    it('should validate correct IBANs', () => {
      expect(ibanRecognizer.validate!('DE89370400440532013000')).toBe(true);
      expect(ibanRecognizer.validate!('GB82WEST12345698765432')).toBe(true);
    });

    it('should reject incorrect checksums', () => {
      expect(ibanRecognizer.validate!('DE00370400440532013000')).toBe(false);
    });

    it('should reject wrong length for country', () => {
      // German IBAN should be 22 chars
      expect(ibanRecognizer.validate!('DE8937040044053201300')).toBe(false);
    });
  });
});

describe('IBAN Checksum Utils', () => {
  it('should validate known valid IBANs', () => {
    const validIbans = [
      'DE89370400440532013000',
      'GB82WEST12345698765432',
      'FR7630006000011234567890189',
      'ES9121000418450200051332',
      'IT60X0542811101000000123456',
    ];

    for (const iban of validIbans) {
      expect(validateIBAN(iban)).toBe(true);
    }
  });

  it('should normalize IBANs', () => {
    expect(normalizeIBAN('DE89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(normalizeIBAN('de89370400440532013000')).toBe('DE89370400440532013000');
  });
});

