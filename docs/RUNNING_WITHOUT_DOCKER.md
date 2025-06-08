# Running ActionSMTP Without Docker

This guide explains how to run ActionSMTP directly on your system without Docker.

## Prerequisites

- Node.js 14.0.0 or higher
- npm (comes with Node.js)
- SpamAssassin (optional, for spam filtering)
- Root/Administrator access (for binding to port 25)

## Installation

### 1. Install Node.js

If you don't have Node.js installed:

**macOS (using Homebrew):**
```bash
brew install node
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download and install from [nodejs.org](https://nodejs.org/)

### 2. Install SpamAssassin (Optional)

SpamAssassin is required only if you want spam filtering enabled.

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install spamassassin spamc
```

**Start SpamAssassin daemon:**
```bash
# Linux
sudo systemctl start spamassassin
sudo systemctl enable spamassassin
```

### 3. Install ActionSMTP

Clone the repository and install dependencies:

```bash
git clone https://github.com/cmer/actionsmtp.git
cd actionsmtp
npm install
```

## Running ActionSMTP

### Basic Usage

Run with default settings:

```bash
sudo node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails
```

**Note:** `sudo` is required to bind to port 25. To avoid using sudo, you can run on a higher port (see below).

### Running on a Higher Port (No sudo required)

```bash
node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails --port 2525
```

### With Authentication

```bash
sudo node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails \
  --auth-pass your-secret-password
```

Or with custom username:
```bash
sudo node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails \
  --auth-user myuser \
  --auth-pass your-secret-password
```

### Disable Spam Filtering

If you don't have SpamAssassin installed or want to disable spam filtering:

```bash
sudo node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails \
  --no-spam-check
```

### Custom SpamAssassin Host

If SpamAssassin is running on a different host or port:

```bash
sudo node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails \
  --spam-host 192.168.1.100 \
  --spam-port 783
```

### All Available Options

```bash
node src/index.js <webhook_url> [options]

Options:
  --port         SMTP port to listen on (default: 25)
  --host         Host to bind to (default: 0.0.0.0)
  --auth-user    Basic auth username for webhook (default: actionmailbox)
  --auth-pass    Basic auth password for webhook
  --max-size     Maximum message size in bytes (default: 25MB)
  --timeout      SMTP timeout in milliseconds (default: 30000)
  --verbose      Enable verbose debug logging
  --no-spam-check  Disable spam filtering (enabled by default)
  --spam-host    SpamAssassin daemon host (default: localhost)
  --spam-port    SpamAssassin daemon port (default: 783)
  --spam-threshold  Spam score threshold for flagging (default: 5.0)
  --spam-reject  Spam score threshold for rejection (default: 10.0)
```

## Using Environment Variables

Instead of command-line arguments, you can use environment variables:

```bash
export WEBHOOK_URL=http://localhost:3000/rails/action_mailbox/relay/inbound_emails
export AUTH_USER=actionmailbox
export AUTH_PASS=your-secret-password
export PORT=2525
export SPAM_CHECK=false
export VERBOSE=true

node src/index.js
```

## Running as a Service

### Using PM2 (Recommended)

Install PM2:
```bash
npm install -g pm2
```

Start ActionSMTP:
```bash
pm2 start src/index.js --name actionsmtp -- http://localhost:3000/rails/action_mailbox/relay/inbound_emails
```

Save PM2 configuration:
```bash
pm2 save
pm2 startup
```

### Using systemd (Linux)

Create a service file `/etc/systemd/system/actionsmtp.service`:

```ini
[Unit]
Description=ActionSMTP SMTP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/actionsmtp
ExecStart=/usr/bin/node /path/to/actionsmtp/src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails
Restart=on-failure
RestartSec=10

# Environment variables
Environment="NODE_ENV=production"
Environment="AUTH_USER=actionmailbox"
Environment="AUTH_PASS=your-secret-password"

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable actionsmtp
sudo systemctl start actionsmtp
```

## Port Forwarding (Alternative to sudo)

To avoid running as root, you can use port forwarding:

**Linux (iptables):**
```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-port 2525
```

**macOS (pfctl):**
```bash
echo "rdr pass inet proto tcp from any to any port 25 -> 127.0.0.1 port 2525" | sudo pfctl -ef -
```

Then run ActionSMTP on port 2525 without sudo:
```bash
node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails --port 2525
```

## Testing Your Setup

Test the SMTP server using telnet:

```bash
telnet localhost 25
```

Or using swaks (Swiss Army Knife for SMTP):

```bash
# Install swaks
brew install swaks  # macOS
sudo apt-get install swaks  # Ubuntu/Debian

# Send test email
swaks --to test@example.com \
      --from sender@example.com \
      --server localhost:25 \
      --body "Test email body"
```

## Troubleshooting

### Permission Denied on Port 25

- Use `sudo` when running the command
- Or run on a higher port (e.g., 2525)
- Or set up port forwarding

### SpamAssassin Connection Failed

- Check if SpamAssassin is running: `sudo systemctl status spamassassin`
- Verify the host and port: `telnet localhost 783`
- Disable spam checking: `--no-spam-check`

### EADDRINUSE Error

Port is already in use. Check what's using it:
```bash
sudo lsof -i :25
```

### Debugging

Enable verbose logging to see detailed debug information:
```bash
node src/index.js http://localhost:3000/webhook --verbose
```


## Security Notes

1. **Running as Root**: Binding to port 25 requires root privileges. Consider using port forwarding or a reverse proxy instead.

2. **Firewall**: Ensure your firewall allows incoming connections on the SMTP port:
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 25/tcp
   
   # CentOS/RHEL
   sudo firewall-cmd --permanent --add-port=25/tcp
   sudo firewall-cmd --reload
   ```

3. **Authentication**: Always use authentication when forwarding to production webhooks:
   ```bash
   --auth-pass your-password
   # Username defaults to 'actionmailbox', or specify custom:
   --auth-user myuser --auth-pass your-password
   ```

4. **SSL/TLS**: For production use, consider placing ActionSMTP behind a reverse proxy with SSL termination.

## Development Mode

For development, it's recommended to:

1. Run on a high port (no sudo required)
2. Enable verbose logging for detailed debugging
3. Disable spam checking if not needed

```bash
node src/index.js http://localhost:3000/rails/action_mailbox/relay/inbound_emails \
  --port 2525 \
  --verbose \
  --no-spam-check
```

This will show detailed logs including:
- Every SMTP command received
- Email processing steps
- Webhook delivery attempts
- Any errors or warnings

Perfect for debugging email flow issues!