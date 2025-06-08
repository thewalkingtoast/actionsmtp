FROM node:18-alpine3.20

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY src ./src

# Make scripts executable
RUN chmod +x src/index.js src/run.sh

# Expose SMTP port
EXPOSE 25

# Environment variables with defaults
ENV WEBHOOK_URL="http://host.docker.internal:3000/rails/action_mailbox/relay/inbound_emails" \
    PORT=25 \
    HOST=0.0.0.0 \
    MAX_SIZE=26214400 \
    TIMEOUT=30000 \
    SPAM_CHECK=true \
    SPAM_HOST=spamassassin \
    SPAM_PORT=783 \
    SPAM_THRESHOLD=5.0 \
    SPAM_REJECT=10.0 \
    VERBOSE=false

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the script
CMD ["./src/run.sh"]
