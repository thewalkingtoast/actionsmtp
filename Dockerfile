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
COPY config.example.yml ./

# Make scripts executable
RUN chmod +x src/index.js

# Expose SMTP port
EXPOSE 25

# Default config path
ENV ACTIONSMTP_CONFIG_PATH=/app/config.yml

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the application
CMD ["node", "src/index.js", "--config", "./data/config.yml"]
