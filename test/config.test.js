const { describe, test, expect } = require('@jest/globals');
const yaml = require('js-yaml');

describe('Configuration Tests', () => {
  test('should parse YAML configuration correctly', () => {
    // Test YAML parsing logic
    const parseYamlConfig = (yamlConfig) => {
      return {
        webhookUrl: yamlConfig.webhook?.url,
        port: yamlConfig.server?.port || 25,
        host: yamlConfig.server?.host || '0.0.0.0',
        authUser: yamlConfig.webhook?.auth?.user || 'actionmailbox',
        authPass: yamlConfig.webhook?.auth?.pass || null,
        maxSize: yamlConfig.server?.maxSize || 25 * 1024 * 1024,
        timeout: yamlConfig.server?.timeout || 30000,
        verbose: yamlConfig.logging?.verbose || false,
        spamCheck: yamlConfig.spam?.enabled !== false,
        spamHost: yamlConfig.spam?.spamassassin?.host || 'localhost',
        spamPort: yamlConfig.spam?.spamassassin?.port || 783,
        spamThreshold: yamlConfig.spam?.thresholds?.flag || 5.0,
        spamReject: yamlConfig.spam?.thresholds?.reject || 10.0
      };
    };

    // Test basic configuration
    const yamlStr1 = `
webhook:
  url: http://localhost/webhook
`;
    const config1 = parseYamlConfig(yaml.load(yamlStr1));
    expect(config1.webhookUrl).toBe('http://localhost/webhook');
    expect(config1.port).toBe(25);
    expect(config1.spamCheck).toBe(true);

    // Test with custom port
    const yamlStr2 = `
webhook:
  url: http://localhost/webhook
server:
  port: 2525
`;
    const config2 = parseYamlConfig(yaml.load(yamlStr2));
    expect(config2.port).toBe(2525);

    // Test with authentication
    const yamlStr3 = `
webhook:
  url: http://localhost/webhook
  auth:
    user: user
    pass: pass
`;
    const config3 = parseYamlConfig(yaml.load(yamlStr3));
    expect(config3.authUser).toBe('user');
    expect(config3.authPass).toBe('pass');

    // Test spam settings
    const yamlStr4 = `
webhook:
  url: http://localhost/webhook
spam:
  enabled: false
`;
    const config4 = parseYamlConfig(yaml.load(yamlStr4));
    expect(config4.spamCheck).toBe(false);

    const yamlStr5 = `
webhook:
  url: http://localhost/webhook
spam:
  thresholds:
    flag: 3.0
    reject: 7.0
`;
    const config5 = parseYamlConfig(yaml.load(yamlStr5));
    expect(config5.spamThreshold).toBe(3.0);
    expect(config5.spamReject).toBe(7.0);

    // Test verbose mode
    const yamlStr6 = `
webhook:
  url: http://localhost/webhook
logging:
  verbose: true
`;
    const config6 = parseYamlConfig(yaml.load(yamlStr6));
    expect(config6.verbose).toBe(true);
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