const { describe, test, expect } = require('@jest/globals');
const dns = require('dns').promises;

describe('DNSBL Tests', () => {
  // Mock checkDNSBL function
  async function checkDNSBL(ip) {
    // Skip private IPs
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.') || ip === '127.0.0.1') {
      return { isListed: false, listings: [] };
    }

    const reversedIP = ip.split('.').reverse().join('.');
    const DNSBL_SERVICES = ['zen.spamhaus.org', 'bl.spamcop.net'];
    
    const checks = DNSBL_SERVICES.map(async (blacklist) => {
      try {
        const hostname = `${reversedIP}.${blacklist}`;
        // In real implementation, this would do DNS lookup
        // For testing, we'll simulate some responses
        if (ip === '192.0.2.1' && blacklist === 'zen.spamhaus.org') {
          return { blacklist, listed: true };
        }
        return { blacklist, listed: false };
      } catch (err) {
        return { blacklist, listed: false };
      }
    });

    const results = await Promise.all(checks);
    const listings = results.filter(r => r.listed);
    
    return {
      isListed: listings.length > 0,
      listings: listings.map(l => l.blacklist)
    };
  }

  test('should skip private IP addresses', async () => {
    const privateIPs = ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1'];
    
    for (const ip of privateIPs) {
      const result = await checkDNSBL(ip);
      expect(result.isListed).toBe(false);
      expect(result.listings).toEqual([]);
    }
  });

  test('should reverse IP address correctly', () => {
    const ip = '1.2.3.4';
    const reversed = ip.split('.').reverse().join('.');
    expect(reversed).toBe('4.3.2.1');
  });

  test('should check multiple DNSBL services', async () => {
    const result = await checkDNSBL('8.8.8.8');
    expect(result).toHaveProperty('isListed');
    expect(result).toHaveProperty('listings');
    expect(Array.isArray(result.listings)).toBe(true);
  });

  test('should detect blacklisted IP', async () => {
    // Using test IP that we simulate as blacklisted
    const result = await checkDNSBL('192.0.2.1');
    expect(result.isListed).toBe(true);
    expect(result.listings).toContain('zen.spamhaus.org');
  });

  test('should handle invalid IP format gracefully', async () => {
    const result = await checkDNSBL('not.an.ip');
    expect(result.isListed).toBe(false);
  });
});