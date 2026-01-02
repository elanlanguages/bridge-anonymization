/**
 * Regex Recognizer Benchmarks
 * Measures latency for individual recognizers and full registry scans
 */

import { describe, bench } from 'vitest';
import {
  createDefaultRegistry,
  emailRecognizer,
  phoneRecognizer,
  ibanRecognizer,
  bicSwiftRecognizer,
  creditCardRecognizer,
  ipAddressRecognizer,
  urlRecognizer,
  createCaseIdRecognizer,
  createCustomerIdRecognizer,
  type RecognizerRegistry,
} from '../../src/recognizers/index.js';
import { createDefaultPolicy, type AnonymizationPolicy } from '../../src/types/index.js';

// =============================================================================
// Test Data
// =============================================================================

// Text with various PII types for individual recognizer testing
const TEXT_WITH_EMAILS = `
Contact us at support@example.com or sales@company.org.
You can also reach john.doe@subdomain.example.co.uk or info+tag@test.io.
For urgent matters: emergency@help.example.com, backup@service.net
`;

const TEXT_WITH_PHONES = `
Call us at +1-555-123-4567 or +49 30 12345678.
International: +44 20 7123 4567, +33 1 23 45 67 89
Local: 0800-123-4567, (555) 987-6543
Mobile: +49 170 1234567, +1 (800) 555-0199
`;

const TEXT_WITH_IBANS = `
German: DE89370400440532013000
French: FR7630006000011234567890189
Spanish: ES9121000418450200051332
Swiss: CH9300762011623852957
UK: GB29NWBK60161331926819
`;

const TEXT_WITH_CREDIT_CARDS = `
Visa: 4532-1234-5678-9012
Mastercard: 5425 2334 3010 9903
Amex: 3782 822463 10005
Discover: 6011111111111117
`;

const TEXT_WITH_IPS = `
Server IPs: 192.168.1.100, 10.0.0.1, 172.16.0.50
Public IPs: 8.8.8.8, 1.1.1.1, 203.0.113.50
Mixed: Connect to 192.168.0.1 or fallback to 10.10.10.10
`;

const TEXT_WITH_URLS = `
Visit https://www.example.com/path?query=value
API: https://api.service.io/v2/endpoint
Docs: http://docs.example.org/guide
`;

const TEXT_WITH_CASE_IDS = `
Reference your case: CASE-2024-123456
Related cases: CASE-2024-789012, CASE-2023-456789
Customer inquiry: CUST-2024-001234
`;

// Mixed content for full registry benchmarks
const MIXED_SHORT = `
Contact john@example.com at +1-555-123-4567.
`;

const MIXED_MEDIUM = `
Customer Support Ticket #CASE-2024-123456

From: john.smith@example.com
Date: 2024-01-15

Dear Support Team,

I'm having trouble with my account. Please contact me at +49 30 12345678 
or my mobile +49 170 1234567.

My payment details:
- IBAN: DE89370400440532013000
- Card: 4532-1234-5678-9012

I've attached logs from server 192.168.1.100.

Best regards,
John Smith
Customer ID: CUST-2024-789456
`;

const MIXED_LONG = `
CONFIDENTIAL - INTERNAL DOCUMENT

Customer Information:
- Primary Email: customer@example.com
- Secondary Email: customer.backup@example.org
- Work Email: j.customer@company.co.uk
- Phone: +1-555-123-4567
- Mobile: +49 170 1234567
- Fax: +1-555-987-6543

Banking Details:
- IBAN (DE): DE89370400440532013000
- IBAN (FR): FR7630006000011234567890189
- IBAN (ES): ES9121000418450200051332
- BIC: COBADEFFXXX
- Credit Card 1: 4532-1234-5678-9012
- Credit Card 2: 5425 2334 3010 9903

Technical Information:
- Primary Server: 192.168.1.100
- Backup Server: 10.0.0.50
- Gateway: 172.16.0.1
- External IP: 203.0.113.100

Case References:
- Initial Case: CASE-2024-001234
- Follow-up: CASE-2024-001235
- Escalation: CASE-2024-001236
- Customer ID: CUST-2024-789456

Additional Contacts:
- Supervisor: supervisor@example.com (+1-555-111-2222)
- Manager: manager@example.org (+1-555-333-4444)
- Director: director@company.com (+1-555-555-6666)

Support History:
- Email to support@helpdesk.com
- Call to +1-800-123-4567
- Chat via https://support.example.com/chat

Payment URLs:
- Invoice: https://billing.example.com/invoice/12345
- Receipt: https://payments.example.org/receipt?id=67890

Server logs from 10.10.10.10 and 192.168.0.1 attached.
Backup data on servers at 172.31.0.100 and 10.20.30.40.

Alternative payment:
IBAN: CH9300762011623852957
Card: 6011111111111117

End of document.
`;

// No-PII text for baseline
const TEXT_NO_PII = `
The quick brown fox jumps over the lazy dog. This sentence contains no 
personally identifiable information whatsoever. It's just regular text 
that should not trigger any recognizer patterns. Lorem ipsum dolor sit 
amet, consectetur adipiscing elit. Numbers like 123 and 456 are not PII.
`;

// =============================================================================
// Individual Recognizer Benchmarks
// =============================================================================

describe('Recognizers - Email', () => {
  bench('emailRecognizer - text with 5 emails', () => {
    emailRecognizer.find(TEXT_WITH_EMAILS);
  });

  bench('emailRecognizer - no matches', () => {
    emailRecognizer.find(TEXT_NO_PII);
  });

  bench('emailRecognizer - long mixed text', () => {
    emailRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - Phone', () => {
  bench('phoneRecognizer - text with 8 phones', () => {
    phoneRecognizer.find(TEXT_WITH_PHONES);
  });

  bench('phoneRecognizer - no matches', () => {
    phoneRecognizer.find(TEXT_NO_PII);
  });

  bench('phoneRecognizer - long mixed text', () => {
    phoneRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - IBAN', () => {
  bench('ibanRecognizer - text with 5 IBANs', () => {
    ibanRecognizer.find(TEXT_WITH_IBANS);
  });

  bench('ibanRecognizer - no matches', () => {
    ibanRecognizer.find(TEXT_NO_PII);
  });

  bench('ibanRecognizer - long mixed text', () => {
    ibanRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - BIC/SWIFT', () => {
  bench('bicSwiftRecognizer - text with BICs', () => {
    bicSwiftRecognizer.find('Transfer via COBADEFFXXX or DEUTDEFF');
  });

  bench('bicSwiftRecognizer - no matches', () => {
    bicSwiftRecognizer.find(TEXT_NO_PII);
  });

  bench('bicSwiftRecognizer - long mixed text', () => {
    bicSwiftRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - Credit Card', () => {
  bench('creditCardRecognizer - text with 4 cards', () => {
    creditCardRecognizer.find(TEXT_WITH_CREDIT_CARDS);
  });

  bench('creditCardRecognizer - no matches', () => {
    creditCardRecognizer.find(TEXT_NO_PII);
  });

  bench('creditCardRecognizer - long mixed text', () => {
    creditCardRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - IP Address', () => {
  bench('ipAddressRecognizer - text with 6 IPs', () => {
    ipAddressRecognizer.find(TEXT_WITH_IPS);
  });

  bench('ipAddressRecognizer - no matches', () => {
    ipAddressRecognizer.find(TEXT_NO_PII);
  });

  bench('ipAddressRecognizer - long mixed text', () => {
    ipAddressRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - URL', () => {
  bench('urlRecognizer - text with 3 URLs', () => {
    urlRecognizer.find(TEXT_WITH_URLS);
  });

  bench('urlRecognizer - no matches', () => {
    urlRecognizer.find(TEXT_NO_PII);
  });

  bench('urlRecognizer - long mixed text', () => {
    urlRecognizer.find(MIXED_LONG);
  });
});

describe('Recognizers - Custom IDs', () => {
  const caseIdRecognizer = createCaseIdRecognizer();
  const customerIdRecognizer = createCustomerIdRecognizer();

  bench('caseIdRecognizer - text with 3 case IDs', () => {
    caseIdRecognizer.find(TEXT_WITH_CASE_IDS);
  });

  bench('customerIdRecognizer - text with 1 customer ID', () => {
    customerIdRecognizer.find(TEXT_WITH_CASE_IDS);
  });

  bench('caseIdRecognizer - no matches', () => {
    caseIdRecognizer.find(TEXT_NO_PII);
  });

  bench('caseIdRecognizer - long mixed text', () => {
    caseIdRecognizer.find(MIXED_LONG);
  });
});

// =============================================================================
// Full Registry Benchmarks
// =============================================================================

describe('Registry - Full Scan', () => {
  const registry = createDefaultRegistry();
  const policy = createDefaultPolicy();

  bench('registry.findAll - short text (~50 chars)', () => {
    registry.findAll(MIXED_SHORT, policy);
  });

  bench('registry.findAll - medium text (~500 chars)', () => {
    registry.findAll(MIXED_MEDIUM, policy);
  });

  bench('registry.findAll - long text (~2000 chars)', () => {
    registry.findAll(MIXED_LONG, policy);
  });

  bench('registry.findAll - no PII text', () => {
    registry.findAll(TEXT_NO_PII, policy);
  });

  bench('registry.findAll - repeated 5x medium text', () => {
    const repeatedText = Array(5).fill(MIXED_MEDIUM).join('\n\n');
    registry.findAll(repeatedText, policy);
  });
});

describe('Registry - Filtered Types', () => {
  const registry = createDefaultRegistry();
  const basePolicy = createDefaultPolicy();
  
  // Policy that only enables EMAIL
  const emailOnlyPolicy: AnonymizationPolicy = {
    ...basePolicy,
    regexEnabledTypes: new Set(['EMAIL']),
  };
  
  // Policy that only enables PHONE
  const phoneOnlyPolicy: AnonymizationPolicy = {
    ...basePolicy,
    regexEnabledTypes: new Set(['PHONE']),
  };

  bench('registry.findAll - email only (long text)', () => {
    registry.findAll(MIXED_LONG, emailOnlyPolicy);
  });

  bench('registry.findAll - phone only (long text)', () => {
    registry.findAll(MIXED_LONG, phoneOnlyPolicy);
  });
});

describe('Registry - Stress Tests', () => {
  const registry = createDefaultRegistry();
  const policy = createDefaultPolicy();

  // Create very long text with many PII instances
  const stressText = Array(10).fill(MIXED_LONG).join('\n\n--- SECTION BREAK ---\n\n');

  bench('registry.findAll - stress test (~20K chars, 100+ PII)', () => {
    registry.findAll(stressText, policy);
  });

  bench('registry.findAll - high email density', () => {
    const emailDense = Array(50)
      .fill(null)
      .map((_, i) => `user${i}@domain${i % 10}.com`)
      .join(', ');
    registry.findAll(emailDense, policy);
  });

  bench('registry.findAll - high phone density', () => {
    const phoneDense = Array(50)
      .fill(null)
      .map((_, i) => `+1-555-${String(i).padStart(3, '0')}-${String(i * 2).padStart(4, '0')}`)
      .join(', ');
    registry.findAll(phoneDense, policy);
  });
});

