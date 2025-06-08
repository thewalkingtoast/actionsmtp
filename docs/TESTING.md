# Testing ActionSMTP

This document explains how to test your ActionSMTP installation using the included test script.

## Quick Test

The easiest way to test your ActionSMTP server is using the included test script:

```bash
node send_test_email.js
```

This will send a test email to `localhost:25` (the default SMTP port).

## Test Script Usage

### Basic Usage

```bash
# Test default localhost:25
node send_test_email.js

# Test different port on localhost
node send_test_email.js localhost:2525

# Test different host (default port 25)
node send_test_email.js 192.168.1.10

# Test different host and port
node send_test_email.js mail.example.com:587

# Test with custom email addresses
FROM=sender@myorg.com TO=admin@myorg.com node send_test_email.js

# Test with custom sender only
FROM=noreply@company.org node send_test_email.js localhost:2525
```

### Options

- `--verbose` or `-v`: Show the complete SMTP conversation
- `--help` or `-h`: Show usage information

### Environment Variables

- `FROM=email@domain.com`: Set sender email address (default: test@example.com)
- `TO=email@domain.com`: Set recipient email address (default: recipient@example.com)

```bash
# Verbose output with full SMTP conversation
node send_test_email.js localhost:2525 --verbose

# Custom sender and recipient with verbose output
FROM=me@company.com TO=admin@company.com node send_test_email.js localhost:2525 --verbose

# Show help
node send_test_email.js --help
```

## What the Test Does

The test script:

1. **Connects** to your SMTP server
2. **Sends EHLO** to identify itself and get server capabilities
3. **Sets sender** (`test@example.com`)
4. **Sets recipient** (`recipient@example.com`) 
5. **Sends a test email** with:
   - Unique Message-ID
   - Current timestamp
   - Proper RFC-compliant headers
6. **Closes the connection** gracefully

## Understanding the Output

### Success Example

```
=== ActionSMTP Test Message Sender ===
Connecting to SMTP server at localhost:25...

Email details:
  From: test@example.com
  To: recipient@example.com
  Subject: Test Email from ActionSMTP Test Script
  Message-ID: <a1b2c3d4e5f6...@example.com>

← [12ms] 220 ActionSMTP - SMTP to Action Mailbox Forwarder
→ [15ms] EHLO testclient.example.com
← [18ms] 250-localhost
← [18ms] 250-SIZE 26214400
← [18ms] 250 ENHANCEDSTATUSCODES
✓ Server capabilities received
  - Max message size: 25MB
→ [20ms] MAIL FROM:<test@example.com>
← [25ms] 250 OK
✓ Sender accepted
→ [27ms] RCPT TO:<recipient@example.com>
← [30ms] 250 OK
✓ Recipient accepted
→ [32ms] DATA
← [35ms] 354 Start mail input; end with <CRLF>.<CRLF>
✓ Ready to receive message data
→ Sending message (234 bytes)...
← [45ms] 250 OK
✅ Message accepted for delivery!
→ [47ms] QUIT
← [50ms] 221 Bye
✓ Connection closed gracefully

=== Test Summary ===
Total time: 52ms
Message sent: Yes
Result: SUCCESS ✅
```

### Failure Examples

**Connection refused:**
```
❌ Connection error: connect ECONNREFUSED 127.0.0.1:25
   Make sure ActionSMTP is running on the specified host and port.
```

**Permission denied (port 25):**
```
❌ Connection error: listen EACCES: permission denied 0.0.0.0:25
   Permission denied. You may need to run with sudo for port 25.
```

**Spam rejection:**
```
← [45ms] 550 Message rejected as spam
❌ Message rejected: 550 Message rejected as spam
   Message was rejected as spam
```

**Temporary failure:**
```
← [45ms] 451 Temporary failure, please retry
⚠️  Temporary failure: 451 Temporary failure, please retry
```

## Troubleshooting

### Server Not Responding

If the test script hangs or times out:

1. **Check if ActionSMTP is running:**
   ```bash
   # If using Docker
   docker-compose ps
   
   # If running directly
   ps aux | grep node
   ```

2. **Check the port:**
   ```bash
   netstat -ln | grep :25
   # or
   lsof -i :25
   ```

3. **Test basic connectivity:**
   ```bash
   telnet localhost 25
   ```

### Permission Errors

If you get permission errors on port 25:

1. **Run ActionSMTP with sudo** (if running directly)
2. **Use a different port** (e.g., 2525):
   ```bash
   # Start ActionSMTP on port 2525
   node src/index.js http://localhost:3000/webhook --port 2525
   
   # Test with the script
   node send_test_email.js localhost:2525
   ```

### Webhook Errors

If the SMTP accepts the message but you don't see it in your Rails app:

1. **Check ActionSMTP logs** for webhook errors
2. **Verify your webhook URL** is correct
3. **Check authentication** (AUTH_USER/AUTH_PASS)
4. **Test the webhook directly:**
   ```bash
   curl -X POST \
     -H "Content-Type: message/rfc822" \
     -d "From: test@example.com..." \
     http://localhost:3000/rails/action_mailbox/relay/inbound_emails
   ```

## Testing Different Scenarios

### Test with Verbose Output

See the complete SMTP conversation from the test script:

```bash
node send_test_email.js --verbose
```

You can also enable verbose logging on the ActionSMTP server itself to see detailed processing:

```bash
# Enable verbose logging on the server
node src/index.js http://localhost:3000/webhook --port 2525 --verbose

# Then run the test in another terminal
node send_test_email.js localhost:2525
```

This will show you both sides of the conversation and all internal processing steps.

### Test Spam Filtering

The test email is designed to be clean and should not trigger spam filters. To test spam filtering:

1. **Check spam headers** in your Rails application
2. **Review ActionSMTP logs** for spam scores
3. **Temporarily lower spam thresholds** for testing

### Test Multiple Messages

Send several test emails quickly:

```bash
for i in {1..5}; do
  echo "Sending test email $i..."
  node send_test_email.js
  sleep 1
done
```

### Test from Different Hosts

If ActionSMTP is running on a remote server:

```bash
node send_test_email.js your-server.com:25
```

## Manual Testing with Telnet

For deeper debugging, you can manually test SMTP commands:

```bash
telnet localhost 25
```

Then type:
```
EHLO test.com
MAIL FROM:<test@example.com>
RCPT TO:<recipient@example.com>
DATA
Subject: Manual Test

This is a manual test.
.
QUIT
```

## Integration with CI/CD

You can use the test script in automated testing:

```bash
#!/bin/bash
# Start ActionSMTP
docker-compose up -d actionsmtp

# Wait for it to be ready
sleep 5

# Run test
if node send_test_email.js; then
  echo "✅ SMTP test passed"
  exit 0
else
  echo "❌ SMTP test failed"
  exit 1
fi
```

The script exits with code 0 on success and 1 on failure, making it suitable for automated testing.