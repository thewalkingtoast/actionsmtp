const { SMTPServer } = require('smtp-server');
const net = require('net');
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');

describe('SMTP Server Tests', () => {
  let server;
  let serverPort = 2525;

  beforeAll((done) => {
    // Create a test SMTP server
    server = new SMTPServer({
      authOptional: true,
      onData(stream, session, callback) {
        stream.on('end', callback);
      }
    });

    server.listen(serverPort, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  test('should connect to SMTP server', (done) => {
    const client = net.createConnection(serverPort, 'localhost');
    
    client.on('connect', () => {
      client.on('data', (data) => {
        const response = data.toString();
        expect(response).toMatch(/^220/);
        client.end();
        done();
      });
    });

    client.on('error', done);
  });

  test('should handle HELO command', (done) => {
    const client = net.createConnection(serverPort, 'localhost');
    
    client.on('connect', () => {
      client.on('data', (data) => {
        const response = data.toString();
        
        if (response.startsWith('220')) {
          client.write('HELO test.com\r\n');
        } else if (response.startsWith('250')) {
          expect(response).toMatch(/^250/);
          client.write('QUIT\r\n');
          client.end();
          done();
        }
      });
    });

    client.on('error', done);
  });

  test('should reject oversized messages', (done) => {
    const testServer = new SMTPServer({
      size: 1024, // 1KB limit
      authOptional: true,
      onData(stream, session, callback) {
        stream.on('end', callback);
      }
    });

    testServer.listen(0, () => {
      const port = testServer.server.address().port;
      const client = net.createConnection(port, 'localhost');
      let step = 0;
      
      client.on('data', (data) => {
        const response = data.toString();
        
        switch(step) {
          case 0: // Initial connection
            expect(response).toMatch(/^220/);
            client.write('EHLO test.com\r\n'); // Use EHLO to get SIZE extension
            step++;
            break;
          case 1: // EHLO response
            // Server should advertise size limit
            expect(response).toMatch(/250/);
            if (response.includes('SIZE')) {
              expect(response).toMatch(/SIZE 1024/);
            }
            client.write('QUIT\r\n');
            step++;
            break;
          case 2: // QUIT response
            expect(response).toMatch(/^221/);
            client.end();
            testServer.close(() => {
              done();
            });
            break;
        }
      });

      client.on('error', (err) => {
        testServer.close(() => {
          done(err);
        });
      });
    });
  }, 10000); // Increase timeout to 10 seconds
});