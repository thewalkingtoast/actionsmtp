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

Create a configuration file:
```bash
cp config.example.yml config.yml
```

Edit `config.yml` with your settings:
```yaml
webhooks:
  yourdomain.com:
    url: "http://localhost:3000/rails/action_mailbox/relay/inbound_emails"
    auth:
      user: "actionmailbox"
      pass: "your-secret-password"
```

Run with default settings:
```bash
sudo node src/index.js
```

**Note:** `sudo` is required to bind to port 25. To avoid using sudo, you can run on a higher port (see below).

### Running on a Higher Port (No sudo required)

Update your `config.yml`:
```yaml
server:
  port: 2525
```

Then run without sudo:
```bash
node src/index.js
```

### Available Command Line Options

```bash
node src/index.js [options]

Options:
  --config       Path to configuration file (default: config.yml)
  --verbose      Enable verbose debug logging
  --help         Show help message
```

## Custom Configuration File

You can specify a custom configuration file path:

```bash
node src/index.js --config /path/to/my-config.yml
```

## Running as a Service

### Using PM2 (Recommended)

Install PM2:
```bash
npm install -g pm2
```

Start ActionSMTP:
```bash
pm2 start src/index.js --name actionsmtp
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
ExecStart=/usr/bin/node /path/to/actionsmtp/src/index.js
Restart=on-failure
RestartSec=10

# Environment variables
Environment="NODE_ENV=production"

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

Then run ActionSMTP on port 2525 without sudo (configure port 2525 in your config.yml):
```bash
node src/index.js
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
node src/index.js --verbose
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

3. **Authentication**: Always use authentication when forwarding to production webhooks. Configure this in your `config.yml`:
   ```yaml
   webhooks:
     yourdomain.com:
       auth:
         user: "actionmailbox"
         pass: "your-password"
   ```

4. **SSL/TLS**: For production use, consider placing ActionSMTP behind a reverse proxy with SSL termination.

## Development Mode

For development, it's recommended to:

1. Run on a high port (no sudo required)
2. Enable verbose logging for detailed debugging
3. Disable spam checking if not needed

```bash
# Configure in config.yml:
# server:
#   port: 2525
# spam:
#   enabled: false
# logging:
#   verbose: true

node src/index.js --verbose
```

This will show detailed logs including:
- Every SMTP command received
- Email processing steps
- Webhook delivery attempts
- Any errors or warnings

Perfect for debugging email flow issues!