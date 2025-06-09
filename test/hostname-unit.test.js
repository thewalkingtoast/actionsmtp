const { describe, test, expect } = require('@jest/globals');
const { SMTPServer } = require('smtp-server');
const net = require('net');
const os = require('os');

describe('Hostname Unit Tests', () => {
  let server;
  let serverPort;

  const createTestServer = (hostname) => {
    return new Promise((resolve) => {
      server = new SMTPServer({
        name: hostname,
        banner: 'Test SMTP Server',
        authOptional: true,
        disabledCommands: ['AUTH'],
        onData(stream, session, callback) {
          stream.on('end', callback);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        serverPort = server.server.address().port;
        resolve();
      });
    });
  };

  const sendCommand = (command) => {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(serverPort, '127.0.0.1');
      let fullResponse = '';
      let commandSent = false;

      client.on('data', (data) => {
        fullResponse += data.toString();
        
        if (!commandSent && fullResponse.includes('220')) {
          client.write(command + '\r\n');
          commandSent = true;
        } else if (commandSent && (fullResponse.includes('250 ') || fullResponse.includes('250-'))) {
          // Got response to our command
          setTimeout(() => {
            client.end();
          }, 100);
        }
      });

      client.on('end', () => {
        resolve(fullResponse);
      });

      client.on('error', reject);
    });
  };

  afterEach((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  test('EHLO should return configured hostname', async () => {
    const testHostname = 'test.mail.server';
    await createTestServer(testHostname);
    
    const response = await sendCommand('EHLO client.example.com');
    
    expect(response).toContain('250-' + testHostname);
  });

  test('HELO should return configured hostname', async () => {
    const testHostname = 'mx.example.org';
    await createTestServer(testHostname);
    
    const response = await sendCommand('HELO client.example.com');
    
    expect(response).toContain('250 ' + testHostname);
  });

  test('should handle system hostname', async () => {
    const systemHostname = os.hostname();
    await createTestServer(systemHostname);
    
    const response = await sendCommand('EHLO client.example.com');
    
    expect(response).toContain('250-' + systemHostname);
  });

  test('hostname configuration parsing', () => {
    const yaml = require('js-yaml');
    
    // Test with hostname configured
    const configWithHostname = yaml.load(`
server:
  hostname: custom.smtp.server
`);
    expect(configWithHostname.server.hostname).toBe('custom.smtp.server');

    // Test without hostname (should be undefined)
    const configWithoutHostname = yaml.load(`
server:
  port: 25
`);
    expect(configWithoutHostname.server.hostname).toBeUndefined();
  });

  test('hostname with special characters', async () => {
    const testHostname = 'mail-01.example-domain.co.uk';
    await createTestServer(testHostname);
    
    const response = await sendCommand('EHLO client');
    
    expect(response).toContain('250-' + testHostname);
  });
});