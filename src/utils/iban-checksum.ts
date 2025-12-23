/**
 * IBAN Checksum Validation (ISO 13616)
 * Uses Mod-97 algorithm
 */

/**
 * Country code to IBAN length mapping (partial list of common countries)
 */
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, // Andorra
  AT: 20, // Austria
  BE: 16, // Belgium
  CH: 21, // Switzerland
  CZ: 24, // Czech Republic
  DE: 22, // Germany
  DK: 18, // Denmark
  ES: 24, // Spain
  FI: 18, // Finland
  FR: 27, // France
  GB: 22, // United Kingdom
  GR: 27, // Greece
  HU: 28, // Hungary
  IE: 22, // Ireland
  IT: 27, // Italy
  LI: 21, // Liechtenstein
  LU: 20, // Luxembourg
  NL: 18, // Netherlands
  NO: 15, // Norway
  PL: 28, // Poland
  PT: 25, // Portugal
  SE: 24, // Sweden
  SK: 24, // Slovakia
};

/**
 * Convert a character to its numeric value for IBAN calculation
 * A=10, B=11, ..., Z=35
 */
function charToNumber(char: string): string {
  const code = char.toUpperCase().charCodeAt(0);
  if (code >= 65 && code <= 90) {
    // A-Z
    return (code - 55).toString();
  }
  return char; // Already a digit
}

/**
 * Rearranges IBAN for checksum calculation:
 * Move first 4 chars to end, convert letters to numbers
 */
function rearrangeForChecksum(iban: string): string {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  let numeric = '';
  for (const char of rearranged) {
    numeric += charToNumber(char);
  }

  return numeric;
}

/**
 * Calculate mod 97 for a large number represented as a string
 */
function mod97(numericString: string): number {
  let remainder = 0;

  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  return remainder;
}

/**
 * Validates an IBAN using the mod-97 algorithm
 * @param iban - IBAN string (spaces allowed)
 * @returns true if checksum is valid
 */
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();

  // Basic format check
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) {
    return false;
  }

  // Check length for known countries
  const countryCode = cleaned.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength !== undefined && cleaned.length !== expectedLength) {
    return false;
  }

  // General length check (IBANs are 15-34 characters)
  if (cleaned.length < 15 || cleaned.length > 34) {
    return false;
  }

  // Mod-97 validation
  const numericString = rearrangeForChecksum(cleaned);
  return mod97(numericString) === 1;
}

/**
 * Normalizes an IBAN by removing spaces and converting to uppercase
 */
export function normalizeIBAN(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

/**
 * Formats an IBAN with spaces every 4 characters for readability
 */
export function formatIBAN(iban: string): string {
  const normalized = normalizeIBAN(iban);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}

