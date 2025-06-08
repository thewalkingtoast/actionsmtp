const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const { SMTPServer } = require('smtp-server');
const net = require('net');
const http = require('http');

describe('Integration Tests', () => {
  let webhookServer;
  let webhookPort;
  let receivedEmails = [];
  let smtpServer;
  let smtpPort = 2526;

  beforeAll((done) => {
    // Create mock webhook server
    webhookServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          receivedEmails.push({
            headers: req.headers,
            body: body
          });
          res.writeHead(200);
          res.end('OK');
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    webhookServer.listen(0, () => {
      webhookPort = webhookServer.address().port;
      
      // Create SMTP server that forwards to webhook
      smtpServer = new SMTPServer({
        authOptional: true,
        onData(stream, session, callback) {
          let emailData = '';
          stream.on('data', chunk => emailData += chunk);
          stream.on('end', () => {
            // Forward to webhook
            const options = {
              hostname: 'localhost',
              port: webhookPort,
              path: '/webhook',
              method: 'POST',
              headers: {
                'Content-Type': 'message/rfc822',
                'Content-Length': Buffer.byteLength(emailData)
              }
            };

            const req = http.request(options, (res) => {
              if (res.statusCode === 200) {
                callback();
              } else {
                callback(new Error('Webhook failed'));
              }
            });

            req.on('error', callback);
            req.write(emailData);
            req.end();
          });
        }
      });

      smtpServer.listen(smtpPort, done);
    });
  });

  afterAll((done) => {
    smtpServer.close(() => {
      webhookServer.close(done);
    });
  });

  test('should forward email to webhook', (done) => {
    receivedEmails = [];
    
    const client = net.createConnection(smtpPort, 'localhost');
    const testEmail = 'From: test@example.com\r\nTo: recipient@example.com\r\nSubject: Test Email\r\n\r\nThis is a test email.';
    
    let step = 0;
    client.on('data', (data) => {
      const response = data.toString();
      
      if (step === 0 && response.startsWith('220')) {
        // Initial connection
        client.write('HELO test.com\r\n');
        step++;
      } else if (step === 1 && response.includes('250')) {
        // HELO response
        client.write('MAIL FROM:<test@example.com>\r\n');
        step++;
      } else if (step === 2 && response.includes('250')) {
        // MAIL FROM response
        client.write('RCPT TO:<recipient@example.com>\r\n');
        step++;
      } else if (step === 3 && response.includes('250')) {
        // RCPT TO response
        client.write('DATA\r\n');
        step++;
      } else if (step === 4 && response.includes('354')) {
        // DATA response
        client.write(testEmail + '\r\n.\r\n');
        step++;
      } else if (step === 5 && response.includes('250')) {
        // Message accepted
        step++;
        // Give webhook time to process
        setTimeout(() => {
          expect(receivedEmails.length).toBe(1);
          expect(receivedEmails[0].headers['content-type']).toBe('message/rfc822');
          expect(receivedEmails[0].body).toContain('This is a test email');
          client.write('QUIT\r\n');
          client.end();
          done();
        }, 100);
      }
    });

    client.on('error', done);
  });

  test('should handle multiple recipients', (done) => {
    receivedEmails = [];
    
    const client = net.createConnection(smtpPort, 'localhost');
    
    let step = 0;
    client.on('data', (data) => {
      const response = data.toString();
      
      if (step === 0 && response.startsWith('220')) {
        // Initial connection
        client.write('HELO test.com\r\n');
        step++;
      } else if (step === 1 && response.includes('250')) {
        // HELO response
        client.write('MAIL FROM:<sender@example.com>\r\n');
        step++;
      } else if (step === 2 && response.includes('250')) {
        // MAIL FROM response
        client.write('RCPT TO:<user1@example.com>\r\n');
        step++;
      } else if (step === 3 && response.includes('250')) {
        // First RCPT TO response
        client.write('RCPT TO:<user2@example.com>\r\n');
        step++;
      } else if (step === 4 && response.includes('250')) {
        // Second RCPT TO response
        client.write('DATA\r\n');
        step++;
      } else if (step === 5 && response.includes('354')) {
        // DATA response
        client.write('Subject: Multiple Recipients\r\n\r\nTest\r\n.\r\n');
        step++;
      } else if (step === 6 && response.includes('250')) {
        // Message accepted
        step++;
        setTimeout(() => {
          client.write('QUIT\r\n');
          client.end();
          done();
        }, 50);
      }
    });

    client.on('error', done);
  });

  test('should reject invalid commands', (done) => {
    const client = net.createConnection(smtpPort, 'localhost');
    let gotInitialResponse = false;
    
    client.on('data', (data) => {
      const response = data.toString();
      
      if (!gotInitialResponse && response.startsWith('220')) {
        gotInitialResponse = true;
        client.write('INVALID_COMMAND\r\n');
      } else if (response.includes('500') || response.includes('502')) {
        // Should get error response for invalid command
        expect(response).toMatch(/^5\d\d/);
        client.write('QUIT\r\n');
        client.end();
        done();
      }
    });

    client.on('error', done);
  });
});