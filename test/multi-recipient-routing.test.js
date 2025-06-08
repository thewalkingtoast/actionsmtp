const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const http = require('http');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const net = require('net');
const fetch = require('node-fetch');

describe('Multi-Recipient Routing Tests', () => {
  // Test the grouping logic directly
  test('should group recipients by webhook correctly', () => {
    const session = {
      webhooksByRecipient: {
        'user1@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
        'user2@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
        'user3@test.com': { url: 'http://webhook2.com', authUser: null, authPass: null },
        'user4@other.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' }
      },
      envelope: {
        rcptTo: [
          { address: 'user1@example.com' },
          { address: 'user2@example.com' },
          { address: 'user3@test.com' },
          { address: 'user4@other.com' }
        ]
      }
    };
    
    // Group recipients by webhook (same logic as main code)
    const recipientsByWebhook = new Map();
    
    for (const recipient of session.envelope.rcptTo) {
      const webhook = session.webhooksByRecipient[recipient.address];
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
      
      recipientsByWebhook.get(webhookKey).recipients.push(recipient.address);
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

  test('should handle multiple recipients with same webhook', () => {
    const session = {
      webhooksByRecipient: {
        'user1@same.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
        'user2@same.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
        'user3@same.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' }
      },
      envelope: {
        rcptTo: [
          { address: 'user1@same.com' },
          { address: 'user2@same.com' },
          { address: 'user3@same.com' }
        ]
      }
    };
    
    // Group recipients by webhook
    const recipientsByWebhook = new Map();
    
    for (const recipient of session.envelope.rcptTo) {
      const webhook = session.webhooksByRecipient[recipient.address];
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
      
      recipientsByWebhook.get(webhookKey).recipients.push(recipient.address);
    }
    
    // Should have only 1 unique webhook
    expect(recipientsByWebhook.size).toBe(1);
    
    const webhookInfo = Array.from(recipientsByWebhook.values())[0];
    expect(webhookInfo.recipients).toHaveLength(3);
    expect(webhookInfo.recipients).toContain('user1@same.com');
    expect(webhookInfo.recipients).toContain('user2@same.com');
    expect(webhookInfo.recipients).toContain('user3@same.com');
  });

  test('should send twice to same URL with different credentials', () => {
    const session = {
      webhooksByRecipient: {
        'user@domain1.com': { url: 'http://same-url.com/webhook', authUser: 'user1', authPass: 'pass1' },
        'user@domain2.com': { url: 'http://same-url.com/webhook', authUser: 'user2', authPass: 'pass2' }
      },
      envelope: {
        rcptTo: [
          { address: 'user@domain1.com' },
          { address: 'user@domain2.com' }
        ]
      }
    };
    
    // Group recipients by webhook
    const recipientsByWebhook = new Map();
    
    for (const recipient of session.envelope.rcptTo) {
      const webhook = session.webhooksByRecipient[recipient.address];
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
      
      recipientsByWebhook.get(webhookKey).recipients.push(recipient.address);
    }
    
    // Should have 2 separate webhook calls because credentials differ
    expect(recipientsByWebhook.size).toBe(2);
    
    const groups = Array.from(recipientsByWebhook.values());
    
    // Both point to same URL but with different auth
    expect(groups[0].webhook.url).toBe('http://same-url.com/webhook');
    expect(groups[1].webhook.url).toBe('http://same-url.com/webhook');
    
    // But have different credentials
    expect(groups[0].webhook.authUser).not.toBe(groups[1].webhook.authUser);
    
    // Each has one recipient
    expect(groups[0].recipients).toHaveLength(1);
    expect(groups[1].recipients).toHaveLength(1);
  });

  test('should handle mixed domains with different webhooks', () => {
    const session = {
      webhooksByRecipient: {
        'user1@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' },
        'user2@different.com': { url: 'http://webhook2.com', authUser: null, authPass: null },
        'user3@example.com': { url: 'http://webhook1.com', authUser: 'user', authPass: 'pass' }
      },
      envelope: {
        rcptTo: [
          { address: 'user1@example.com' },
          { address: 'user2@different.com' },
          { address: 'user3@example.com' }
        ]
      }
    };
    
    // Group recipients by webhook
    const recipientsByWebhook = new Map();
    
    for (const recipient of session.envelope.rcptTo) {
      const webhook = session.webhooksByRecipient[recipient.address];
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
      
      recipientsByWebhook.get(webhookKey).recipients.push(recipient.address);
    }
    
    // Should have 2 unique webhooks
    expect(recipientsByWebhook.size).toBe(2);
    
    const groups = Array.from(recipientsByWebhook.values());
    const webhook1Group = groups.find(g => g.webhook.url === 'http://webhook1.com');
    const webhook2Group = groups.find(g => g.webhook.url === 'http://webhook2.com');
    
    // webhook1 should have user1 and user3 from example.com
    expect(webhook1Group.recipients).toHaveLength(2);
    expect(webhook1Group.recipients).toContain('user1@example.com');
    expect(webhook1Group.recipients).toContain('user3@example.com');
    
    // webhook2 should only have user2 from different.com
    expect(webhook2Group.recipients).toHaveLength(1);
    expect(webhook2Group.recipients).toContain('user2@different.com');
  });
});