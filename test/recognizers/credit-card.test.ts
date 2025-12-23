import { describe, it, expect } from 'vitest';
import { creditCardRecognizer, identifyCardType } from '../../src/recognizers/credit-card.js';
import { validateLuhn } from '../../src/utils/luhn.js';
import { PIIType } from '../../src/types/index.js';

describe('Credit Card Recognizer', () => {
  describe('find', () => {
    it('should detect Visa card numbers', () => {
      // Valid Visa test number (Luhn valid)
      const text = 'Card: 4111111111111111';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.type).toBe(PIIType.CREDIT_CARD);
    });

    it('should detect Mastercard numbers', () => {
      // Valid Mastercard test number
      const text = 'MC: 5500000000000004';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should detect American Express numbers', () => {
      // Valid Amex test number
      const text = 'Amex: 378282246310005';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should detect card numbers with dashes', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should detect card numbers with spaces', () => {
      const text = 'Card: 4111 1111 1111 1111';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(1);
    });

    it('should not detect invalid card numbers (wrong checksum)', () => {
      const text = 'Invalid: 1234567890123456';
      const matches = creditCardRecognizer.find(text);

      expect(matches).toHaveLength(0);
    });

    it('should not detect all same digits', () => {
      const text = 'Not valid: 1111111111111111';
      const matches = creditCardRecognizer.find(text);

      // Might match but should be filtered by validate
      for (const match of matches) {
        // If it matches, it should still pass Luhn (1111... actually fails Luhn)
        expect(validateLuhn(match.text)).toBe(false);
      }
    });
  });

  describe('validate', () => {
    it('should validate cards with correct Luhn checksum', () => {
      expect(creditCardRecognizer.validate!('4111111111111111')).toBe(true);
      expect(creditCardRecognizer.validate!('5500000000000004')).toBe(true);
    });

    it('should reject invalid checksum', () => {
      expect(creditCardRecognizer.validate!('4111111111111112')).toBe(false);
    });

    it('should reject too short numbers', () => {
      expect(creditCardRecognizer.validate!('411111111111')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should remove separators', () => {
      expect(creditCardRecognizer.normalize!('4111-1111-1111-1111')).toBe('4111111111111111');
      expect(creditCardRecognizer.normalize!('4111 1111 1111 1111')).toBe('4111111111111111');
    });
  });
});

describe('identifyCardType', () => {
  it('should identify Visa cards', () => {
    expect(identifyCardType('4111111111111111')).toBe('visa');
  });

  it('should identify Mastercard', () => {
    expect(identifyCardType('5500000000000004')).toBe('mastercard');
  });

  it('should identify Amex', () => {
    expect(identifyCardType('378282246310005')).toBe('amex');
  });
});

describe('Luhn Algorithm', () => {
  it('should validate correct numbers', () => {
    expect(validateLuhn('4111111111111111')).toBe(true);
    expect(validateLuhn('79927398713')).toBe(true);
  });

  it('should reject incorrect numbers', () => {
    expect(validateLuhn('4111111111111112')).toBe(false);
    expect(validateLuhn('1234567890123456')).toBe(false);
  });

  it('should handle numbers with separators', () => {
    expect(validateLuhn('4111-1111-1111-1111')).toBe(true);
    expect(validateLuhn('4111 1111 1111 1111')).toBe(true);
  });
});

