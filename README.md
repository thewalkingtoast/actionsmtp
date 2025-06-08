# ActionSMTP

A lightweight SMTP server that forwards incoming emails to Rails Action Mailbox webhooks with built-in spam filtering.

## Features

- Simple SMTP server that listens on port 25
- Forwards emails in RFC822 format to Action Mailbox
- **Built-in spam filtering** (enabled by default):
  - DNS Blacklist (DNSBL) checking at connection time
  - SpamAssassin integration for content analysis
  - Configurable spam thresholds
- Supports basic authentication for webhooks
- Docker-ready with proper signal handling

## Installation

### Option 1: Using Docker Image from GitHub Container Registry

1. Pull the latest image:
```bash
docker pull ghcr.io/cmer/actionsmtp:latest
```

2. Run with environment variables:
```bash
docker run -d \
  --name actionsmtp \
  -p 25:25 \
  -e WEBHOOK_URL=http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails \
  -e AUTH_PASS=your-secret-password \
  ghcr.io/cmer/actionsmtp:latest
```

### Option 2: Using Docker Compose

1. Create a `docker-compose.yml` file:
```yaml
version: '3.8'
services:
  actionsmtp:
    image: ghcr.io/cmer/actionsmtp:latest
    ports:
      - "25:25"
    environment:
      - WEBHOOK_URL=http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails
      - AUTH_PASS=your-secret-password
    depends_on:
      - spamassassin

  spamassassin:
    image: instantlinux/spamassassin:latest
    hostname: spamassassin
```

2. Start the services:
```bash
docker-compose up -d
```

### Option 3: Build from Source

1. Clone the repository:
```bash
git clone https://github.com/cmer/actionsmtp.git
cd actionsmtp
```

2. Copy the example files:
```bash
cp .env.example .env
cp docker-compose.yml.example docker-compose.yml
```

3. Edit `.env` with your webhook URL and authentication:
```bash
# Edit .env with your settings
WEBHOOK_URL=http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails
AUTH_USER=actionmailbox
AUTH_PASS=your-secret-password
```

4. Start with Docker Compose:
```bash
docker-compose up -d
```

## Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_URL` | http://host.docker.internal:3000/... | Action Mailbox webhook URL |
| `AUTH_USER` | actionmailbox | Basic auth username |
| `AUTH_PASS` | - | Basic auth password |
| `SPAM_CHECK` | true | Enable spam filtering |
| `SPAM_THRESHOLD` | 5.0 | Score to flag as spam |
| `SPAM_REJECT` | 10.0 | Score to reject email |
| `SPAM_HOST` | spamassassin | SpamAssassin host |
| `SPAM_PORT` | 783 | SpamAssassin port |
| `PORT` | 25 | SMTP listen port |
| `HOST` | 0.0.0.0 | Bind address |
| `MAX_SIZE` | 26214400 | Max email size (bytes) |
| `TIMEOUT` | 30000 | Timeout (ms) |
| `VERBOSE` | false | Enable verbose logging |

## Spam Filtering

Spam filtering is **enabled by default** with a balanced approach:

1. **DNSBL Check** (at connection time):
   - Checks against Spamhaus ZEN and SpamCop
   - Immediate rejection of blacklisted IPs
   - Fast with 3-second timeout

2. **SpamAssassin Analysis** (during data transfer):
   - Content and header analysis
   - Default threshold: 5.0 (flag as spam)
   - Reject threshold: 10.0 (reject message)
   - Adds X-Spam-* headers to emails

### Customizing Spam Thresholds

```yaml
# More aggressive: flag at 3.0, reject at 7.0
environment:
  - SPAM_THRESHOLD=3.0
  - SPAM_REJECT=7.0

# More permissive: flag at 7.0, reject at 15.0
environment:
  - SPAM_THRESHOLD=7.0
  - SPAM_REJECT=15.0

# Flag only, never reject
environment:
  - SPAM_REJECT=999
```

### Spam Headers Added

```
X-Spam-Score: 7.5
X-Spam-Status: Yes, score=7.5 required=5.0
X-Spam-Tests: BAYES_99, HTML_MESSAGE, MISSING_DATE
X-Spam-DNSBL: Listed on zen.spamhaus.org
```

## Logging

ActionSMTP provides comprehensive logging for monitoring email processing:

### Normal Logging
Shows key events with timestamps:
- Connection attempts and results
- Email reception and processing
- Spam filtering results
- Webhook delivery status
- Errors and warnings

```
[2024-01-01T12:00:00.000Z] INFO: CONNECT - IP: 192.168.1.100
[2024-01-01T12:00:01.000Z] INFO: EMAIL_RECEIVED - From: sender@example.com, To: recipient@example.com, IP: 192.168.1.100, Size: 1024 bytes
[2024-01-01T12:00:02.000Z] INFO: SPAM_CHECK - CLEAN - Score: 2.1/5.0, From: sender@example.com, IP: 192.168.1.100
[2024-01-01T12:00:03.000Z] INFO: WEBHOOK_SUCCESS - HTTP 200, From: sender@example.com, To: recipient@example.com
[2024-01-01T12:00:04.000Z] INFO: EMAIL_ACCEPTED - From: sender@example.com, To: recipient@example.com, IP: 192.168.1.100, Successfully processed and forwarded
```

### Verbose Logging
Enable with `VERBOSE=true` to see detailed debugging information:
- SMTP command details
- SpamAssassin connection status
- DNSBL check results
- Webhook request details
- Processing timings

```yaml
# Enable verbose logging
environment:
  - VERBOSE=true
```

Or when running directly:
```bash
node src/index.js http://localhost:3000/webhook --verbose
```

## Docker Compose Configuration

The `docker-compose.yml.example` file includes:
- ActionSMTP service configured to use environment variables
- SpamAssassin service for spam filtering
- Proper networking to connect to Rails on your host machine

You can customize the Docker Compose configuration by editing your local `docker-compose.yml` file. For example, to mount custom SpamAssassin rules:

```yaml
services:
  spamassassin:
    volumes:
      - ./spam-rules:/etc/spamassassin/local.d:ro
```

## Setting up Action Mailbox

1. Configure Action Mailbox in your Rails app:

```ruby
# config/environments/production.rb
config.action_mailbox.ingress = :relay
```

2. Set up ingress credentials:

```bash
# Generate a secure password
bin/rails runner "puts SecureRandom.base58(24)"

# Or edit your credentials file
bin/rails credentials:edit --environment=production
```

Add to your credentials:
```yaml
action_mailbox:
  ingress_password: your-generated-password
```

3. Use this password as your AUTH_PASS in ActionSMTP configuration.

## Processing Spam in Rails

```ruby
# app/mailboxes/application_mailbox.rb
class ApplicationMailbox < ActionMailbox::Base
  before_processing :check_spam_headers
  
  private
  
  def check_spam_headers
    spam_score = mail.header['X-Spam-Score']&.value&.to_f || 0
    
    if spam_score >= 5.0
      # Handle spam - quarantine, tag, or process differently
      mail['X-Quarantine'] = 'spam'
    end
  end
end
```

## Security Considerations

- This server accepts all incoming SMTP connections (except blacklisted IPs)
- Use firewall rules to restrict access to trusted sources
- Always use HTTPS and authentication when forwarding to production webhooks
- Consider running behind a reverse proxy for additional security

## Troubleshooting

View logs:
```bash
docker-compose logs -f actionsmtp
```

Test SMTP connection:
```bash
telnet localhost 25
```

Check if services are running:
```bash
docker-compose ps
```

Common issues:
- **Port 25 already in use**: Stop other mail servers or change the port in `.env`
- **Connection refused**: Ensure Docker is running and ports are properly mapped
- **401 Unauthorized**: Check AUTH_USER and AUTH_PASS match your Rails credentials
- **SpamAssassin connection failed**: Check that the spamassassin service is running

## License

MIT
