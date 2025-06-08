#!/bin/sh

# Default values
WEBHOOK_URL=${WEBHOOK_URL:-"http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails"}
PORT=${PORT:-25}
HOST=${HOST:-0.0.0.0}
MAX_SIZE=${MAX_SIZE:-26214400}
TIMEOUT=${TIMEOUT:-30000}
SPAM_CHECK=${SPAM_CHECK:-true}
SPAM_HOST=${SPAM_HOST:-spamassassin}
SPAM_PORT=${SPAM_PORT:-783}
SPAM_THRESHOLD=${SPAM_THRESHOLD:-5.0}
SPAM_REJECT=${SPAM_REJECT:-10.0}

# Build command
CMD="node src/index.js $WEBHOOK_URL"
CMD="$CMD --port $PORT"
CMD="$CMD --host $HOST"
CMD="$CMD --max-size $MAX_SIZE"
CMD="$CMD --timeout $TIMEOUT"

# Add auth if provided
if [ -n "$AUTH_USER" ]; then
    CMD="$CMD --auth-user $AUTH_USER"
fi

if [ -n "$AUTH_PASS" ]; then
    CMD="$CMD --auth-pass $AUTH_PASS"
fi

# Spam settings
if [ "$SPAM_CHECK" = "false" ]; then
    CMD="$CMD --no-spam-check"
else
    CMD="$CMD --spam-host $SPAM_HOST"
    CMD="$CMD --spam-port $SPAM_PORT"
    CMD="$CMD --spam-threshold $SPAM_THRESHOLD"
    CMD="$CMD --spam-reject $SPAM_REJECT"
fi

# Verbose mode
if [ "$VERBOSE" = "true" ]; then
    CMD="$CMD --verbose"
fi

echo "Starting ActionSMTP..."
echo "Webhook URL: $WEBHOOK_URL"
echo "Spam filtering: $SPAM_CHECK"

exec $CMD
