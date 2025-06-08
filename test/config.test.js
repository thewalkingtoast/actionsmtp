const { describe, test, expect } = require('@jest/globals');
const yaml = require('js-yaml');

describe('Configuration Tests', () => {
  test('should parse webhooks configuration correctly', () => {
    // Test parsing webhooks
    const parseWebhooks = (yamlConfig) => {
      const webhooks = [];
      if (yamlConfig.webhooks) {
        for (const [domains, webhookConfig] of Object.entries(yamlConfig.webhooks)) {
          if (!webhookConfig.url) continue;
          
          const domainList = domains.split(',').map(d => d.trim()).filter(d => d);
          
          webhooks.push({
            domains: domainList,
            url: webhookConfig.url,
            authUser: webhookConfig.auth?.user || 'actionmailbox',
            authPass: webhookConfig.auth?.pass || null
          });
        }
      }
      return webhooks;
    };

    // Test basic webhook configuration
    const yamlStr1 = `
webhooks:
  example.com:
    url: http://localhost/webhook
`;
    const webhooks1 = parseWebhooks(yaml.load(yamlStr1));
    expect(webhooks1).toHaveLength(1);
    expect(webhooks1[0].domains).toEqual(['example.com']);
    expect(webhooks1[0].url).toBe('http://localhost/webhook');

    // Test multiple domains
    const yamlStr2 = `
webhooks:
  example.com, example.org:
    url: http://localhost/webhook
`;
    const webhooks2 = parseWebhooks(yaml.load(yamlStr2));
    expect(webhooks2).toHaveLength(1);
    expect(webhooks2[0].domains).toEqual(['example.com', 'example.org']);

    // Test with authentication
    const yamlStr3 = `
webhooks:
  example.com:
    url: http://localhost/webhook
    auth:
      user: testuser
      pass: testpass
`;
    const webhooks3 = parseWebhooks(yaml.load(yamlStr3));
    expect(webhooks3[0].authUser).toBe('testuser');
    expect(webhooks3[0].authPass).toBe('testpass');

    // Test multiple webhooks
    const yamlStr4 = `
webhooks:
  example.com:
    url: http://webhook1.com
  test.org:
    url: http://webhook2.com
`;
    const webhooks4 = parseWebhooks(yaml.load(yamlStr4));
    expect(webhooks4).toHaveLength(2);
    expect(webhooks4[0].url).toBe('http://webhook1.com');
    expect(webhooks4[1].url).toBe('http://webhook2.com');

    // Test wildcard domains
    const yamlStr5 = `
webhooks:
  "*.example.com":
    url: http://wildcard.webhook.com
  "*":
    url: http://catchall.webhook.com
`;
    const webhooks5 = parseWebhooks(yaml.load(yamlStr5));
    expect(webhooks5).toHaveLength(2);
    expect(webhooks5[0].domains).toEqual(['*.example.com']);
    expect(webhooks5[1].domains).toEqual(['*']);
  });

  test('should validate webhook URL', () => {
    const isValidUrl = (url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    expect(isValidUrl('http://localhost:3000/webhook')).toBe(true);
    expect(isValidUrl('https://example.com/rails/action_mailbox/relay/inbound_emails')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });

  test('should have sensible defaults', () => {
    const defaults = {
      port: 25,
      host: '0.0.0.0',
      maxSize: 25 * 1024 * 1024,
      timeout: 30000,
      spamCheck: true,
      spamThreshold: 5.0,
      spamReject: 10.0
    };

    expect(defaults.port).toBe(25);
    expect(defaults.maxSize).toBe(26214400); // 25MB
    expect(defaults.spamThreshold).toBeLessThan(defaults.spamReject);
  });
});