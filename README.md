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

2. Create a configuration file:
```bash
# Copy the example configuration
cp config.example.yml config.yml
# Edit config.yml with your webhook settings
```

3. Run with Docker:
```bash
docker run -d \
  --name actionsmtp \
  -p 25:25 \
  -v $(pwd)/config.yml:/app/config.yml:ro \
  ghcr.io/cmer/actionsmtp:latest
```

### Option 2: Using Docker Compose

1. Copy the example files:
```bash
cp config.example.yml config.yml
cp docker-compose.yml.example docker-compose.yml
```

2. Edit `config.yml` with your webhook URL and authentication settings

3. Start the services:
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
cp config.example.yml config.yml
cp docker-compose.yml.example docker-compose.yml
```

3. Edit `config.yml` with your webhook URL and authentication:
```yaml
# Edit config.yml with your settings
webhooks:
  yourdomain.com:
    url: "http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails"
    auth:
      user: "actionmailbox"
      pass: "your-secret-password"
```

4. Start with Docker Compose:
```bash
docker-compose up -d
```

## Configuration

ActionSMTP uses a YAML configuration file (`config.yml`). See `config.example.yml` for all available options.

### Multi-Domain Routing

ActionSMTP supports routing emails to different webhooks based on the recipient domain. This allows you to:
- Run a single SMTP server for multiple applications
- Route different domains to different Rails apps or webhook endpoints
- Use different authentication credentials per domain
- Implement domain whitelisting (only configured domains are accepted)

#### Example Multi-Domain Configuration

```yaml
webhooks:
  # Route main domains to production
  example.com, example.org:
    url: "https://app.example.com/rails/action_mailbox/relay/inbound_emails"
    auth:
      user: "actionmailbox"
      pass: "production-secret"

  # Route all subdomains to staging
  "*.staging.example.com":
    url: "https://staging.example.com/rails/action_mailbox/relay/inbound_emails"
    auth:
      user: "actionmailbox"
      pass: "staging-secret"

  # Different app for support emails
  support.example.com:
    url: "https://support.example.com/webhook"

  # Catch-all (not recommended - accepts any domain)
  # "*":
  #   url: "https://default.example.com/webhook"
```

#### Domain Matching Rules

1. **Exact match**: `example.com` matches only `example.com`
2. **Multiple domains**: `example.com, example.org` matches either domain
3. **Subdomain wildcard**: `*.example.com` matches `example.com`, `sub.example.com`, `deep.sub.example.com`
4. **Catch-all**: `*` matches any domain (use with extreme caution)

Domains are matched in the order they appear in the configuration. The first match wins.

See `config.multi-domain.example.yml` for a comprehensive example.

### Command Line Options

| Option | Description |
|--------|-------------|
| `--config` | Path to configuration file (default: config.yml) |
| `--verbose` | Enable verbose logging (overrides config file) |
| `--help` | Show help message |

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

Edit your `config.yml` file:

```yaml
# More aggressive: flag at 3.0, reject at 7.0
spam:
  thresholds:
    flag: 3.0
    reject: 7.0

# More permissive: flag at 7.0, reject at 15.0
spam:
  thresholds:
    flag: 7.0
    reject: 15.0

# Flag only, never reject
spam:
  thresholds:
    flag: 5.0
    reject: 999
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
Enable verbose logging to see detailed debugging information:
- SMTP command details
- SpamAssassin connection status
- DNSBL check results
- Webhook request details
- Processing timings

```yaml
# In config.yml
logging:
  verbose: true
```

Or override via command line:
```bash
actionsmtp --verbose
# or
node src/index.js --verbose
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

3. Use this password in your ActionSMTP `config.yml` file under the webhook auth section.

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
- **Port 25 already in use**: Stop other mail servers or change the port in `config.yml`
- **Connection refused**: Ensure Docker is running and ports are properly mapped
- **401 Unauthorized**: Check webhook auth credentials in `config.yml` match your Rails credentials
- **SpamAssassin connection failed**: Check that the spamassassin service is running

## License

MIT
