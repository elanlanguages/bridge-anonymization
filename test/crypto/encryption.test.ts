import { describe, it, expect } from 'vitest';
import {
  encryptPIIMap,
  decryptPIIMap,
  generateKey,
  generateSalt,
  deriveKey,
  validateKey,
  InMemoryKeyProvider,
} from '../../src/crypto/pii-map-crypto.js';

describe('PII Map Encryption', () => {
  describe('generateKey', () => {
    it('should generate a 32-byte key by default', () => {
      const key = generateKey();
      expect(key.length).toBe(32);
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('generateSalt', () => {
    it('should generate a 16-byte salt by default', () => {
      const salt = generateSalt();
      expect(salt.length).toBe(16);
    });
  });

  describe('deriveKey', () => {
    it('should derive consistent key from password and salt', () => {
      const password = 'test-password';
      const salt = generateSalt();

      const key1 = deriveKey(password, salt);
      const key2 = deriveKey(password, salt);

      expect(key1.equals(key2)).toBe(true);
      expect(key1.length).toBe(32);
    });

    it('should derive different keys for different passwords', () => {
      const salt = generateSalt();

      const key1 = deriveKey('password1', salt);
      const key2 = deriveKey('password2', salt);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive different keys for different salts', () => {
      const password = 'test-password';

      const key1 = deriveKey(password, generateSalt());
      const key2 = deriveKey(password, generateSalt());

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encryptPIIMap / decryptPIIMap', () => {
    it('should encrypt and decrypt a PII map', () => {
      const key = generateKey();
      const originalMap = new Map([
        ['PERSON_1', 'John Smith'],
        ['EMAIL_2', 'john@example.com'],
        ['PHONE_3', '+49123456789'],
      ]);

      const encrypted = encryptPIIMap(originalMap, key);
      const decrypted = decryptPIIMap(encrypted, key);

      expect(decrypted.size).toBe(originalMap.size);
      expect(decrypted.get('PERSON_1')).toBe('John Smith');
      expect(decrypted.get('EMAIL_2')).toBe('john@example.com');
      expect(decrypted.get('PHONE_3')).toBe('+49123456789');
    });

    it('should produce different ciphertext for same data', () => {
      const key = generateKey();
      const map = new Map([['PERSON_1', 'John']]);

      const encrypted1 = encryptPIIMap(map, key);
      const encrypted2 = encryptPIIMap(map, key);

      // Different IVs should produce different ciphertext
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle empty map', () => {
      const key = generateKey();
      const emptyMap = new Map<string, string>();

      const encrypted = encryptPIIMap(emptyMap, key);
      const decrypted = decryptPIIMap(encrypted, key);

      expect(decrypted.size).toBe(0);
    });

    it('should handle special characters in values', () => {
      const key = generateKey();
      const map = new Map([
        ['PERSON_1', 'Müller, Hans-Peter'],
        ['ADDRESS_2', '123 Main St.\nApt #4\n"Suite"'],
      ]);

      const encrypted = encryptPIIMap(map, key);
      const decrypted = decryptPIIMap(encrypted, key);

      expect(decrypted.get('PERSON_1')).toBe('Müller, Hans-Peter');
      expect(decrypted.get('ADDRESS_2')).toBe('123 Main St.\nApt #4\n"Suite"');
    });

    it('should fail with wrong key', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const map = new Map([['PERSON_1', 'John']]);

      const encrypted = encryptPIIMap(map, key1);

      expect(() => decryptPIIMap(encrypted, key2)).toThrow();
    });

    it('should fail with tampered ciphertext', () => {
      const key = generateKey();
      const map = new Map([['PERSON_1', 'John']]);

      const encrypted = encryptPIIMap(map, key);

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] = (tamperedCiphertext[0]! + 1) % 256;

      const tampered = {
        ...encrypted,
        ciphertext: tamperedCiphertext.toString('base64'),
      };

      expect(() => decryptPIIMap(tampered, key)).toThrow();
    });

    it('should throw for invalid key length', () => {
      const shortKey = Buffer.alloc(16); // Too short
      const map = new Map([['PERSON_1', 'John']]);

      expect(() => encryptPIIMap(map, shortKey)).toThrow('Invalid key length');
    });
  });

  describe('validateKey', () => {
    it('should return true for valid key', () => {
      const key = generateKey();
      expect(validateKey(key)).toBe(true);
    });

    it('should return false for invalid key length', () => {
      expect(validateKey(Buffer.alloc(16))).toBe(false);
      expect(validateKey(Buffer.alloc(64))).toBe(false);
    });
  });

  describe('InMemoryKeyProvider', () => {
    it('should return the same key', async () => {
      const provider = new InMemoryKeyProvider();

      const key1 = await provider.getKey();
      const key2 = await provider.getKey();

      expect(key1.equals(key2)).toBe(true);
    });

    it('should use provided key', async () => {
      const customKey = generateKey();
      const provider = new InMemoryKeyProvider(customKey);

      const key = await provider.getKey();

      expect(key.equals(customKey)).toBe(true);
    });

    it('should rotate to new key', async () => {
      const provider = new InMemoryKeyProvider();

      const key1 = await provider.getKey();
      const key2 = await provider.rotateKey!();
      const key3 = await provider.getKey();

      expect(key1.equals(key2)).toBe(false);
      expect(key2.equals(key3)).toBe(true);
    });
  });
});

