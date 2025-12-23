import { describe, it, expect } from 'vitest';
import { phoneRecognizer } from '../../src/recognizers/phone.js';
import { PIIType, DetectionSource } from '../../src/types/index.js';

describe('Phone Recognizer', () => {
  describe('find', () => {
    it('should detect international format phone numbers', () => {
      const text = 'Call us at +49 123 456789';
      const matches = phoneRecognizer.find(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0]?.type).toBe(PIIType.PHONE);
    });

    it('should detect German phone numbers', () => {
      const text = 'Telefon: 030 12345678';
      const matches = phoneRecognizer.find(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect US format phone numbers', () => {
      const text = 'Call (555) 123-4567';
      const matches = phoneRecognizer.find(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect French format phone numbers', () => {
      // French format with full 10 digits (non-sequential to pass validation)
      const text = 'Téléphone: 0142567890';
      const matches = phoneRecognizer.find(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect phone numbers with country code 00 prefix', () => {
      const text = 'International: 0049 30 1234567';
      const matches = phoneRecognizer.find(text);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should not match sequences that are too short', () => {
      const text = 'Code: 12345';
      const matches = phoneRecognizer.find(text);

      expect(matches).toHaveLength(0);
    });

    it('should not match repeated digits', () => {
      const text = 'Not a phone: 00000000000';
      const matches = phoneRecognizer.find(text);

      expect(matches).toHaveLength(0);
    });
  });

  describe('validate', () => {
    it('should validate phone numbers with sufficient digits', () => {
      expect(phoneRecognizer.validate!('+4912345678')).toBe(true);
      expect(phoneRecognizer.validate!('030 1234567')).toBe(true);
    });

    it('should reject all-same-digit numbers', () => {
      expect(phoneRecognizer.validate!('1111111111')).toBe(false);
    });

    it('should reject sequential numbers', () => {
      expect(phoneRecognizer.validate!('123456789')).toBe(false);
      expect(phoneRecognizer.validate!('987654321')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize phone numbers to digits only', () => {
      expect(phoneRecognizer.normalize!('+49 (0) 30 / 123-456')).toBe('+49030123456');
      expect(phoneRecognizer.normalize!('030 1234567')).toBe('0301234567');
    });
  });
});

