# Spam Filtering Setup Guide

## Overview

ActionSMTP includes built-in spam filtering that's enabled by default:

1. **DNS Blacklists (DNSBL)** - Lightweight IP reputation checking
2. **SpamAssassin** - Full-featured spam detection

## Configuration

All spam settings are configured via environment variables in your `.env` file:

```bash
# Enable/disable spam filtering
SPAM_CHECK=true

# Spam score thresholds
SPAM_THRESHOLD=5.0    # Score to flag as spam (adds headers)
SPAM_REJECT=10.0      # Score to reject email (returns SMTP error)

# SpamAssassin connection
SPAM_HOST=spamassassin
SPAM_PORT=783
```

## Threshold Examples

### Default (Balanced)
```bash
SPAM_THRESHOLD=5.0
SPAM_REJECT=10.0
```
- Good balance between catching spam and avoiding false positives

### Aggressive
```bash
SPAM_THRESHOLD=3.0
SPAM_REJECT=7.0
```
- Catches more spam but may have more false positives

### Permissive
```bash
SPAM_THRESHOLD=7.0
SPAM_REJECT=15.0
```
- Fewer false positives but more spam gets through

### Flag Only (Never Reject)
```bash
SPAM_REJECT=999
```
- All emails delivered with spam headers for Rails to handle

## Spam Headers

ActionSMTP adds these headers to emails:

```
X-Spam-Score: 7.5
X-Spam-Status: Yes, score=7.5 required=5.0
X-Spam-Tests: BAYES_99, HTML_MESSAGE, MISSING_DATE
X-Spam-DNSBL: Listed on zen.spamhaus.org
```

## Processing in Rails

```ruby
# app/mailboxes/application_mailbox.rb
class ApplicationMailbox < ActionMailbox::Base
  before_processing :check_spam_headers
  
  private
  
  def check_spam_headers
    spam_score = mail.header['X-Spam-Score']&.value&.to_f || 0
    spam_status = mail.header['X-Spam-Status']&.value
    
    if spam_score > 10
      # Very high score - likely spam
      bounced!
    elsif spam_score > 5
      # Moderate score - quarantine for review
      mail['X-Quarantine'] = 'spam'
    end
  end
end
```

## Custom SpamAssassin Rules

Create a `spam-rules` directory and mount it in docker-compose.yml:

```yaml
services:
  spamassassin:
    image: instantlinux/spamassassin:3.4.6-r0
    volumes:
      - ./spam-rules:/etc/spamassassin/local.d:ro
```

Example `spam-rules/local.cf`:
```perl
# Whitelist your domains
whitelist_from *@yourdomain.com
whitelist_from *@trustedpartner.com

# Custom scoring
score URIBL_BLACK 3.0
score URIBL_SBL 2.0

# Custom rules
header LOCAL_FAKE_INVOICE Subject =~ /invoice.*pdf/i
score LOCAL_FAKE_INVOICE 2.0
```

## Monitoring

View spam statistics:
```bash
# Check recent spam scores
docker-compose logs actionsmtp | grep "Spam check"

# Monitor rejection rate
docker-compose logs actionsmtp | grep -c "Rejecting spam"
```

## Testing

Test your spam filtering:

```bash
# Should pass
echo "Normal business email" | \
  swaks --to test@localhost --server localhost --port 25

# Should be flagged (score ~5-7)
echo "Buy cheap meds online! Click here now!" | \
  swaks --to test@localhost --server localhost --port 25 \
  --header "Subject: URGENT OFFER!!!"

# Should be rejected (score >10)
echo -e "Subject: Test\n\nXJS*C4JDBQADN1.NSBN3*2IDNEN*GTUBE-STANDARD-ANTI-UBE-TEST-EMAIL*C.34X" | \
  swaks --to test@localhost --server localhost --port 25 --data -
```

## Troubleshooting

### SpamAssassin not working
```bash
# Check if SpamAssassin is running
docker-compose ps spamassassin

# Test SpamAssassin directly
docker-compose exec spamassassin spamc -R < test-email.txt
```

### Too many false positives
- Increase `SPAM_THRESHOLD` to 6.0 or 7.0
- Add legitimate senders to whitelist
- Review spam tests in headers to identify problematic rules

### Too much spam getting through
- Decrease `SPAM_THRESHOLD` to 4.0 or 3.0
- Enable additional SpamAssassin plugins
- Consider adding more DNSBL services (requires code modification)
