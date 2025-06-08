const { describe, test, expect } = require('@jest/globals');

describe('Spam Header Tests', () => {
  // Mock function similar to addSpamHeaders
  function addSpamHeaders(emailStr, dnsblResult, spamResult) {
    const headerEnd = emailStr.indexOf('\r\n\r\n');
    
    if (headerEnd === -1) {
      return emailStr;
    }

    const headers = [
      `X-Spam-Score: ${spamResult.score}`,
      `X-Spam-Status: ${spamResult.score >= 5.0 ? 'Yes' : 'No'}, score=${spamResult.score} required=5.0`,
      `X-Spam-Tests: ${spamResult.tests.join(', ')}`
    ];

    if (dnsblResult.isListed) {
      headers.push(`X-Spam-DNSBL: Listed on ${dnsblResult.listings.join(', ')}`);
    }

    const newEmail = 
      emailStr.substring(0, headerEnd) + '\r\n' +
      headers.join('\r\n') + '\r\n' +
      emailStr.substring(headerEnd);

    return newEmail;
  }

  test('should add spam headers to clean email', () => {
    const originalEmail = 'From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nBody';
    const spamResult = { score: 2.5, tests: ['BAYES_50', 'HTML_MESSAGE'] };
    const dnsblResult = { isListed: false, listings: [] };

    const modifiedEmail = addSpamHeaders(originalEmail, dnsblResult, spamResult);

    expect(modifiedEmail).toContain('X-Spam-Score: 2.5');
    expect(modifiedEmail).toContain('X-Spam-Status: No');
    expect(modifiedEmail).toContain('X-Spam-Tests: BAYES_50, HTML_MESSAGE');
    expect(modifiedEmail).not.toContain('X-Spam-DNSBL');
  });

  test('should mark email as spam when score exceeds threshold', () => {
    const originalEmail = 'From: spammer@example.com\r\n\r\nSpam content';
    const spamResult = { score: 7.5, tests: ['BAYES_99', 'MISSING_SUBJECT', 'NO_RECEIVED'] };
    const dnsblResult = { isListed: false, listings: [] };

    const modifiedEmail = addSpamHeaders(originalEmail, dnsblResult, spamResult);

    expect(modifiedEmail).toContain('X-Spam-Score: 7.5');
    expect(modifiedEmail).toContain('X-Spam-Status: Yes');
  });

  test('should add DNSBL header when IP is blacklisted', () => {
    const originalEmail = 'From: sender@example.com\r\n\r\nBody';
    const spamResult = { score: 3.0, tests: [] };
    const dnsblResult = { isListed: true, listings: ['zen.spamhaus.org', 'bl.spamcop.net'] };

    const modifiedEmail = addSpamHeaders(originalEmail, dnsblResult, spamResult);

    expect(modifiedEmail).toContain('X-Spam-DNSBL: Listed on zen.spamhaus.org, bl.spamcop.net');
  });

  test('should handle email without proper headers', () => {
    const malformedEmail = 'This is not a properly formatted email';
    const spamResult = { score: 0, tests: [] };
    const dnsblResult = { isListed: false, listings: [] };

    const result = addSpamHeaders(malformedEmail, dnsblResult, spamResult);

    expect(result).toBe(malformedEmail); // Should return unchanged
  });

  test('should preserve original email content', () => {
    const originalEmail = 'From: sender@example.com\r\nSubject: Test\r\n\r\nOriginal body content\r\nLine 2';
    const spamResult = { score: 1.0, tests: ['SPF_PASS'] };
    const dnsblResult = { isListed: false, listings: [] };

    const modifiedEmail = addSpamHeaders(originalEmail, dnsblResult, spamResult);

    expect(modifiedEmail).toContain('Original body content\r\nLine 2');
    expect(modifiedEmail).toContain('From: sender@example.com');
    expect(modifiedEmail).toContain('Subject: Test');
  });
});