import { describe, it, expect } from 'vitest';
import { emailRecognizer } from '../../src/recognizers/email.js';
import { PIIType, DetectionSource } from '../../src/types/index.js';

describe('Email Recognizer', () => {
  describe('find', () => {
    it('should detect simple email addresses', () => {
      const text = 'Contact us at hello@example.com for more info.';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        type: PIIType.EMAIL,
        text: 'hello@example.com',
        source: DetectionSource.REGEX,
      });
    });

    it('should detect multiple email addresses', () => {
      const text = 'Send to john@company.org or jane@company.org';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(2);
      expect(matches[0]?.text).toBe('john@company.org');
      expect(matches[1]?.text).toBe('jane@company.org');
    });

    it('should detect email with subdomains', () => {
      const text = 'Email: support@mail.example.co.uk';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.text).toBe('support@mail.example.co.uk');
    });

    it('should detect email with plus sign', () => {
      const text = 'My email is test+filter@gmail.com';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.text).toBe('test+filter@gmail.com');
    });

    it('should detect email with dots in local part', () => {
      const text = 'Contact: first.last.name@domain.com';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.text).toBe('first.last.name@domain.com');
    });

    it('should not match invalid emails', () => {
      const invalidEmails = [
        'not an email',
        '@nodomain.com',
        'noat.com',
        // Note: 'spaces in@email.com' contains 'in@email.com' which is technically valid
      ];

      for (const text of invalidEmails) {
        const matches = emailRecognizer.find(text);
        expect(matches).toHaveLength(0);
      }
    });

    it('should provide correct offsets', () => {
      const text = 'Email: test@example.com here';
      const matches = emailRecognizer.find(text);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.start).toBe(7);
      expect(matches[0]?.end).toBe(23);
      expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe('test@example.com');
    });
  });

  describe('validate', () => {
    it('should validate correct emails', () => {
      expect(emailRecognizer.validate!('test@example.com')).toBe(true);
      expect(emailRecognizer.validate!('a@b.co')).toBe(true);
    });

    it('should reject emails with consecutive dots', () => {
      expect(emailRecognizer.validate!('test..test@example.com')).toBe(false);
    });

    it('should reject emails starting or ending with dot in local part', () => {
      expect(emailRecognizer.validate!('.test@example.com')).toBe(false);
      expect(emailRecognizer.validate!('test.@example.com')).toBe(false);
    });

    it('should reject emails without TLD', () => {
      expect(emailRecognizer.validate!('test@example')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should lowercase and trim emails', () => {
      expect(emailRecognizer.normalize!('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
    });
  });
});

