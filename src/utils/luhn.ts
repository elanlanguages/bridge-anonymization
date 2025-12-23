/**
 * Luhn Algorithm (Mod 10) Implementation
 * Used for validating credit card numbers and other identifier checksums
 */

/**
 * Validates a number string using the Luhn algorithm
 * @param input - String of digits (spaces and dashes are stripped)
 * @returns true if the checksum is valid
 */
export function validateLuhn(input: string): boolean {
  // Remove spaces, dashes, and other non-digit characters
  const digits = input.replace(/\D/g, '');

  if (digits.length === 0) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  // Process digits from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]!, 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Calculates the Luhn check digit for a partial number
 * @param partialNumber - String of digits without the check digit
 * @returns The check digit (0-9)
 */
export function calculateLuhnCheckDigit(partialNumber: string): number {
  const digits = partialNumber.replace(/\D/g, '');

  let sum = 0;
  let isEven = true; // Start with true since we're adding a digit

  // Process digits from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]!, 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return (10 - (sum % 10)) % 10;
}

