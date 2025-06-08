# ActionSMTP Quick Start Guide

## Quick Setup

1. Copy the example files:

```bash
cp .env.example .env
cp docker-compose.yml.example docker-compose.yml
```

2. Edit `.env` with your settings:

```bash
# Edit these values
WEBHOOK_URL=http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails
AUTH_USER=actionmailbox
AUTH_PASS=your-secret-password-here  # Get from: bin/rails action_mailbox:ingress:details
```

3. (Optional) Edit `docker-compose.yml` if you need to change ports or add custom SpamAssassin rules.

4. Start the services:

```bash
docker-compose up -d
```

That's it! ActionSMTP is now running with spam filtering enabled.

## Testing

Send a test email:
```bash
echo "Test email" | mail -s "Test" test@yourdomain.com
```

Check spam filtering:
```bash
# This should be flagged as spam
echo "Buy Viagra now! Click here!" | mail -s "URGENT!!!" test@yourdomain.com
```

## Production Checklist

- [ ] Update `.env` with production webhook URL and credentials
- [ ] DNS MX record points to your server
- [ ] Firewall allows port 25
- [ ] SPF record includes your server IP
- [ ] Monitoring/alerting configured
- [ ] Backup strategy in place

## Default Behavior

- **Spam filtering**: ON
- **DNSBL check**: Spamhaus + SpamCop
- **Spam threshold**: 5.0 (flag as spam)
- **Reject threshold**: 10.0 (reject email)
- **Action**: Flag (adds headers, forwards email)

## Troubleshooting

```bash
# View logs
docker-compose logs -f actionsmtp

# Check services
docker-compose ps

# Test SMTP
telnet localhost 25

# Restart services
docker-compose restart
```
