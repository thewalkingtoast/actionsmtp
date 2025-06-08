#!/usr/bin/env node

const net = require('net');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
let host = 'localhost';
let port = 25;

// Parse host:port from first argument if provided
if (args.length > 0 && args[0].includes(':')) {
  const [parsedHost, parsedPort] = args[0].split(':');
  host = parsedHost || host;
  port = parseInt(parsedPort) || port;
} else if (args.length > 0) {
  // Just host provided
  host = args[0];
}

// Generate test email data
const messageId = crypto.randomBytes(16).toString('hex');
const date = new Date().toUTCString();
const testEmail = {
  from: process.env.FROM || 'test@example.com',
  to: process.env.TO || 'recipient@example.com',
  subject: 'Test Email from ActionSMTP Test Script',
  body: `This is a test email sent at ${new Date().toISOString()}\n\nIf you received this, your ActionSMTP server is working correctly!`
};

// Build the email content
const emailContent = [
  `From: ${testEmail.from}`,
  `To: ${testEmail.to}`,
  `Subject: ${testEmail.subject}`,
  `Date: ${date}`,
  `Message-ID: <${messageId}@example.com>`,
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  testEmail.body
].join('\r\n');

console.log('=== ActionSMTP Test Message Sender ===');
console.log(`Connecting to SMTP server at ${host}:${port}...`);
console.log('');

// Create connection
const client = net.createConnection(port, host);
let step = 0;
let startTime = Date.now();

// Handle connection errors
client.on('error', (err) => {
  console.error(`❌ Connection error: ${err.message}`);
  if (err.code === 'ECONNREFUSED') {
    console.error('   Make sure ActionSMTP is running on the specified host and port.');
  } else if (err.code === 'EACCES') {
    console.error('   Permission denied. You may need to run with sudo for port 25.');
  }
  process.exit(1);
});

// Handle timeout
client.setTimeout(10000); // 10 second timeout
client.on('timeout', () => {
  console.error('❌ Connection timeout after 10 seconds');
  client.destroy();
  process.exit(1);
});

// Track SMTP conversation and success status
const conversation = [];
let messageAccepted = false;

// Handle server responses
client.on('data', (data) => {
  const response = data.toString().trim();
  const responseCode = response.substring(0, 3);
  const elapsed = Date.now() - startTime;
  
  console.log(`← [${elapsed}ms] ${response}`);
  conversation.push(`← ${response}`);
  
  switch(step) {
    case 0: // Initial connection
      if (responseCode === '220') {
        sendCommand('EHLO testclient.example.com');
        step++;
      } else {
        console.error(`❌ Unexpected response: expected 220, got ${responseCode}`);
        client.end();
      }
      break;
      
    case 1: // EHLO response
      if (responseCode === '250') {
        console.log('✓ Server capabilities received');
        // Parse extensions from multi-line response
        if (response.includes('SIZE')) {
          const sizeMatch = response.match(/SIZE (\d+)/);
          if (sizeMatch) {
            console.log(`  - Max message size: ${parseInt(sizeMatch[1]) / 1024 / 1024}MB`);
          }
        }
        if (response.includes('8BITMIME')) {
          console.log('  - 8BITMIME supported');
        }
        sendCommand(`MAIL FROM:<${testEmail.from}>`);
        step++;
      } else {
        console.error(`❌ EHLO failed: ${response}`);
        client.end();
      }
      break;
      
    case 2: // MAIL FROM response
      if (responseCode === '250') {
        console.log('✓ Sender accepted');
        sendCommand(`RCPT TO:<${testEmail.to}>`);
        step++;
      } else {
        console.error(`❌ MAIL FROM rejected: ${response}`);
        client.end();
      }
      break;
      
    case 3: // RCPT TO response
      if (responseCode === '250') {
        console.log('✓ Recipient accepted');
        sendCommand('DATA');
        step++;
      } else {
        console.error(`❌ RCPT TO rejected: ${response}`);
        client.end();
      }
      break;
      
    case 4: // DATA response
      if (responseCode === '354') {
        console.log('✓ Ready to receive message data');
        console.log(`→ Sending message (${emailContent.length} bytes)...`);
        // Send the email content
        client.write(emailContent + '\r\n.\r\n');
        conversation.push(`→ [Message content - ${emailContent.length} bytes]`);
        step++;
      } else {
        console.error(`❌ DATA command rejected: ${response}`);
        client.end();
      }
      break;
      
    case 5: // Message accepted response
      if (responseCode === '250') {
        console.log('✅ Message accepted for delivery!');
        messageAccepted = true;
        sendCommand('QUIT');
        step++;
      } else if (responseCode === '550' || responseCode === '554') {
        console.error(`❌ Message rejected: ${response}`);
        if (response.toLowerCase().includes('spam')) {
          console.error('   Message was rejected as spam');
        }
        sendCommand('QUIT');
        step++;
      } else if (responseCode === '451' || responseCode === '452') {
        console.error(`⚠️  Temporary failure: ${response}`);
        sendCommand('QUIT');
        step++;
      } else {
        console.error(`❌ Unexpected response: ${response}`);
        client.end();
      }
      break;
      
    case 6: // QUIT response
      if (responseCode === '221') {
        console.log('✓ Connection closed gracefully');
        console.log('');
        console.log('=== Test Summary ===');
        console.log(`Total time: ${Date.now() - startTime}ms`);
        console.log(`Message sent: ${messageAccepted ? 'Yes' : 'No'}`);
        if (messageAccepted) {
          console.log('Result: SUCCESS ✅');
        } else {
          console.log('Result: FAILED ❌');
        }
        
        if (args.includes('--verbose') || args.includes('-v')) {
          console.log('');
          console.log('=== Full SMTP Conversation ===');
          conversation.forEach(line => console.log(line));
        }
        
        // Exit with appropriate code
        process.exit(messageAccepted ? 0 : 1);
      }
      client.end();
      break;
  }
});

// Helper function to send commands
function sendCommand(command) {
  const elapsed = Date.now() - startTime;
  console.log(`→ [${elapsed}ms] ${command}`);
  conversation.push(`→ ${command}`);
  client.write(command + '\r\n');
}

// Handle connection close
client.on('close', () => {
  if (step < 6) {
    console.error('');
    console.error('❌ Connection closed unexpectedly');
    process.exit(1);
  }
});

// Show usage if --help is provided
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node send_test_email.js [host:port] [options]

Examples:
  node send_test_email.js                    # Connect to localhost:25
  node send_test_email.js localhost:2525     # Connect to localhost:2525
  node send_test_email.js 192.168.1.10       # Connect to 192.168.1.10:25
  node send_test_email.js mail.example.com:587  # Connect to mail.example.com:587

Environment Variables:
  FROM=email@domain.com    Set sender email address (default: test@example.com)
  TO=email@domain.com      Set recipient email address (default: recipient@example.com)

Examples with environment variables:
  FROM=sender@myorg.com TO=me@myorg.com node send_test_email.js
  FROM=test@company.org node send_test_email.js localhost:2525
  TO=admin@example.com node send_test_email.js --verbose

Options:
  --verbose, -v    Show full SMTP conversation
  --help, -h       Show this help message
`);
  process.exit(0);
}

// Display what we're about to send
console.log('Email details:');
console.log(`  From: ${testEmail.from}`);
console.log(`  To: ${testEmail.to}`);
console.log(`  Subject: ${testEmail.subject}`);
console.log(`  Message-ID: <${messageId}@example.com>`);
console.log('');