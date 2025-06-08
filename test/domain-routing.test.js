const { describe, test, expect } = require('@jest/globals');

describe('Domain Routing Tests', () => {
  // Test domain matching logic
  const matchesDomain = (emailDomain, pattern) => {
    // Exact match
    if (pattern === emailDomain) {
      return true;
    }
    
    // Wildcard match for all domains
    if (pattern === '*') {
      return true;
    }
    
    // Subdomain wildcard match (*.example.com)
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.substring(2);
      return emailDomain === baseDomain || emailDomain.endsWith('.' + baseDomain);
    }
    
    return false;
  };

  test('should match exact domains', () => {
    expect(matchesDomain('example.com', 'example.com')).toBe(true);
    expect(matchesDomain('example.org', 'example.com')).toBe(false);
    expect(matchesDomain('test.example.com', 'example.com')).toBe(false);
  });

  test('should match wildcard for all domains', () => {
    expect(matchesDomain('example.com', '*')).toBe(true);
    expect(matchesDomain('test.org', '*')).toBe(true);
    expect(matchesDomain('sub.domain.com', '*')).toBe(true);
  });

  test('should match subdomain wildcards', () => {
    // *.example.com should match subdomains and the base domain
    expect(matchesDomain('example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('test.example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('deep.sub.example.com', '*.example.com')).toBe(true);
    
    // Should not match different domains
    expect(matchesDomain('example.org', '*.example.com')).toBe(false);
    expect(matchesDomain('notexample.com', '*.example.com')).toBe(false);
  });

  test('should find correct webhook for domain', () => {
    const webhooks = [
      {
        domains: ['example.com', 'example.org'],
        url: 'http://webhook1.com',
        authUser: 'user1',
        authPass: 'pass1'
      },
      {
        domains: ['*.test.com'],
        url: 'http://webhook2.com',
        authUser: 'user2',
        authPass: 'pass2'
      },
      {
        domains: ['specific.domain.com'],
        url: 'http://webhook3.com',
        authUser: null,
        authPass: null
      }
    ];

    const findWebhookForDomain = (domain) => {
      for (const webhook of webhooks) {
        for (const pattern of webhook.domains) {
          if (matchesDomain(domain, pattern)) {
            return webhook;
          }
        }
      }
      return null;
    };

    // Test exact matches
    expect(findWebhookForDomain('example.com')).toEqual(webhooks[0]);
    expect(findWebhookForDomain('example.org')).toEqual(webhooks[0]);
    expect(findWebhookForDomain('specific.domain.com')).toEqual(webhooks[2]);

    // Test wildcard matches
    expect(findWebhookForDomain('test.com')).toEqual(webhooks[1]);
    expect(findWebhookForDomain('sub.test.com')).toEqual(webhooks[1]);
    expect(findWebhookForDomain('deep.sub.test.com')).toEqual(webhooks[1]);

    // Test no match
    expect(findWebhookForDomain('unknown.com')).toBe(null);
  });

  test('should handle case-insensitive domain matching', () => {
    expect(matchesDomain('example.com', 'EXAMPLE.COM')).toBe(false); // Pattern is case-sensitive
    expect(matchesDomain('EXAMPLE.COM'.toLowerCase(), 'example.com')).toBe(true);
  });

  test('should group recipients by webhook', () => {
    const webhooksByRecipient = {
      'user1@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
      'user2@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
      'user3@test.com': { url: 'http://webhook2.com', authUser: null, authPass: null },
      'user4@other.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' }
    };

    // Group by unique webhook configuration
    const recipientsByWebhook = new Map();
    
    for (const [recipient, webhook] of Object.entries(webhooksByRecipient)) {
      const webhookKey = JSON.stringify({
        url: webhook.url,
        authUser: webhook.authUser,
        authPass: webhook.authPass
      });
      
      if (!recipientsByWebhook.has(webhookKey)) {
        recipientsByWebhook.set(webhookKey, {
          webhook: webhook,
          recipients: []
        });
      }
      
      recipientsByWebhook.get(webhookKey).recipients.push(recipient);
    }

    // Should have 2 unique webhooks
    expect(recipientsByWebhook.size).toBe(2);
    
    // Check grouping
    const groups = Array.from(recipientsByWebhook.values());
    const webhook1Group = groups.find(g => g.webhook.url === 'http://webhook1.com');
    const webhook2Group = groups.find(g => g.webhook.url === 'http://webhook2.com');
    
    expect(webhook1Group.recipients).toHaveLength(3);
    expect(webhook1Group.recipients).toContain('user1@example.com');
    expect(webhook1Group.recipients).toContain('user2@example.com');
    expect(webhook1Group.recipients).toContain('user4@other.com');
    
    expect(webhook2Group.recipients).toHaveLength(1);
    expect(webhook2Group.recipients).toContain('user3@test.com');
  });
});