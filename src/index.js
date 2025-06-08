#!/usr/bin/env node

const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const fetch = require('node-fetch');
const { Writable } = require('stream');
const dns = require('dns').promises;
const net = require('net');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: actionsmtp <webhook_url> [options]

Arguments:
  webhook_url    The Action Mailbox webhook URL (e.g., http://localhost/rails/action_mailbox/relay/inbound_emails)

Options:
  --port         SMTP port to listen on (default: 25)
  --host         Host to bind to (default: 0.0.0.0)
  --auth-user    Basic auth username for webhook (default: actionmailbox)
  --auth-pass    Basic auth password for webhook
  --max-size     Maximum message size in bytes (default: 25MB)
  --timeout      SMTP timeout in milliseconds (default: 30000)
  --verbose      Enable verbose logging
  --no-spam-check  Disable spam filtering (enabled by default)
  --spam-host    SpamAssassin daemon host (default: localhost)
  --spam-port    SpamAssassin daemon port (default: 783)
  --spam-threshold  Spam score threshold for flagging (default: 5.0)
  --spam-reject  Spam score threshold for rejection (default: 10.0)

Example:
  actionsmtp http://localhost:3000/rails/action_mailbox/relay/inbound_emails
  actionsmtp https://myapp.com/rails/action_mailbox/relay/inbound_emails --auth-pass=secret
  actionsmtp https://myapp.com/rails/action_mailbox/relay/inbound_emails --auth-user=customuser --auth-pass=secret
  actionsmtp <webhook_url> --spam-threshold 3.0 --spam-reject 7.0  # More aggressive spam filtering
`);
  process.exit(0);
}

// Configuration with sensible defaults
const config = {
  webhookUrl: args[0],
  port: 25,
  host: '0.0.0.0',
  authUser: 'actionmailbox',
  authPass: null,
  maxSize: 25 * 1024 * 1024, // 25MB
  timeout: 30000,
  verbose: false,
  spamCheck: true, // ON by default
  spamHost: 'localhost',
  spamPort: 783,
  spamThreshold: 5.0,
  spamReject: 10.0,
  spamAction: 'flag'
};

// Parse options
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  
  switch (arg) {
    case '--port':
      config.port = parseInt(next) || 25;
      i++;
      break;
    case '--host':
      config.host = next || '0.0.0.0';
      i++;
      break;
    case '--auth-user':
      config.authUser = next || 'actionmailbox';
      i++;
      break;
    case '--auth-pass':
      config.authPass = next;
      i++;
      break;
    case '--max-size':
      config.maxSize = parseInt(next) || config.maxSize;
      i++;
      break;
    case '--timeout':
      config.timeout = parseInt(next) || config.timeout;
      i++;
      break;
    case '--verbose':
      config.verbose = true;
      break;
    case '--no-spam-check':
      config.spamCheck = false;
      break;
    case '--spam-host':
      config.spamHost = next || 'localhost';
      i++;
      break;
    case '--spam-port':
      config.spamPort = parseInt(next) || 783;
      i++;
      break;
    case '--spam-threshold':
      config.spamThreshold = parseFloat(next) || 5.0;
      i++;
      break;
    case '--spam-reject':
      config.spamReject = parseFloat(next) || 10.0;
      i++;
      break;
  }
}

// Logging functions
const log = (message) => {
  console.log(`[${new Date().toISOString()}] INFO: ${message}`);
};

const debug = (message) => {
  if (config.verbose) {
    console.log(`[${new Date().toISOString()}] DEBUG: ${message}`);
  }
};

const warn = (message) => {
  console.log(`[${new Date().toISOString()}] WARN: ${message}`);
};

const error = (message, err) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, err || '');
};

const logEmailInfo = (session, action, details = '') => {
  const from = session.envelope?.mailFrom?.address || 'unknown';
  const to = session.envelope?.rcptTo?.map(r => r.address).join(', ') || 'unknown';
  const ip = session.remoteAddress || 'unknown';
  log(`${action} - From: ${from}, To: ${to}, IP: ${ip}${details ? ', ' + details : ''}`);
};

const logSpamCheck = (session, spamResult, dnsblResult) => {
  const from = session.envelope?.mailFrom?.address || 'unknown';
  const ip = session.remoteAddress || 'unknown';
  const spamStatus = spamResult.score >= config.spamThreshold ? 'SPAM' : 'CLEAN';
  
  log(`SPAM_CHECK - ${spamStatus} - Score: ${spamResult.score}/${config.spamThreshold}, From: ${from}, IP: ${ip}`);
  
  if (config.verbose) {
    debug(`Spam tests: ${spamResult.tests.join(', ')}`);
    if (dnsblResult.isListed) {
      debug(`DNSBL listings: ${dnsblResult.listings.join(', ')}`);
    }
  }
};

const logWebhookResult = (session, success, responseStatus, errorDetails = null) => {
  const from = session.envelope?.mailFrom?.address || 'unknown';
  const to = session.envelope?.rcptTo?.map(r => r.address).join(', ') || 'unknown';
  
  if (success) {
    log(`WEBHOOK_SUCCESS - HTTP ${responseStatus}, From: ${from}, To: ${to}`);
  } else {
    error(`WEBHOOK_FAILED - HTTP ${responseStatus || 'N/A'}, From: ${from}, To: ${to}`, errorDetails);
  }
};

// Fast, reliable DNSBL services
const DNSBL_SERVICES = [
  'zen.spamhaus.org',  // Highly reliable, combines multiple lists
  'bl.spamcop.net'     // Fast and efficient
];

// Check IP against DNS blacklists
async function checkDNSBL(ip) {
  // Skip private IPs
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.') || ip === '127.0.0.1') {
    debug(`Skipping DNSBL check for private IP: ${ip}`);
    return { isListed: false, listings: [] };
  }

  debug(`Starting DNSBL check for IP: ${ip}`);
  const reversedIP = ip.split('.').reverse().join('.');
  const checks = DNSBL_SERVICES.map(async (blacklist) => {
    try {
      const hostname = `${reversedIP}.${blacklist}`;
      await dns.resolve4(hostname);
      // If resolve succeeds, IP is listed
      debug(`IP ${ip} listed on ${blacklist}`);
      return { blacklist, listed: true };
    } catch (err) {
      // NXDOMAIN means not listed
      debug(`IP ${ip} not listed on ${blacklist}`);
      return { blacklist, listed: false };
    }
  });

  try {
    const results = await Promise.race([
      Promise.all(checks),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNSBL timeout')), 3000))
    ]);
    
    const listings = results.filter(r => r.listed);
    const result = {
      isListed: listings.length > 0,
      listings: listings.map(l => l.blacklist)
    };
    
    if (result.isListed) {
      warn(`IP ${ip} found on DNSBL: ${result.listings.join(', ')}`);
    } else {
      debug(`IP ${ip} clean on all DNSBL services`);
    }
    
    return result;
  } catch (err) {
    debug(`DNSBL check failed for ${ip}: ${err.message}`);
    return { isListed: false, listings: [] };
  }
}

// Check email with SpamAssassin
async function checkSpamAssassin(rawEmail) {
  debug(`Starting SpamAssassin check (${rawEmail.length} bytes)`);
  
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = net.createConnection(config.spamPort, config.spamHost);
    } catch (err) {
      warn(`SpamAssassin connection failed: ${err.message}`);
      resolve({ score: 0, threshold: config.spamThreshold, tests: [] });
      return;
    }
    const timeout = setTimeout(() => {
      client.destroy();
      warn('SpamAssassin check timed out after 10 seconds');
      resolve({ score: 0, threshold: config.spamThreshold, tests: [] });
    }, 10000);

    let response = Buffer.alloc(0);
    
    client.on('connect', () => {
      debug(`Connected to SpamAssassin at ${config.spamHost}:${config.spamPort}`);
      // SPAMC protocol
      const headers = [
        'SYMBOLS SPAMC/1.5',
        `Content-length: ${rawEmail.length}`,
        '',
        ''
      ].join('\r\n');
      
      client.write(headers);
      client.write(rawEmail);
    });

    client.on('data', (data) => {
      response = Buffer.concat([response, data]);
    });

    client.on('end', () => {
      clearTimeout(timeout);
      debug('SpamAssassin check completed');
      
      try {
        const responseStr = response.toString();
        const lines = responseStr.split('\r\n');
        
        // Parse Spam: True ; 15.5 / 5.0
        const spamLine = lines.find(l => l.startsWith('Spam:')) || '';
        const spamMatch = spamLine.match(/Spam: (True|False) ; (-?\d+\.?\d*) \/ (-?\d+\.?\d*)/);
        
        const score = spamMatch ? parseFloat(spamMatch[2]) : 0;
        const threshold = spamMatch ? parseFloat(spamMatch[3]) : config.spamThreshold;
        
        // Parse tests
        const testsLine = lines.find(l => l.includes(',')) || '';
        const tests = testsLine ? testsLine.split(',').map(t => t.trim()).filter(t => t) : [];

        debug(`SpamAssassin result: score=${score}, threshold=${threshold}, tests=${tests.length}`);
        
        resolve({
          score: score,
          threshold: threshold,
          tests: tests
        });
      } catch (err) {
        warn(`Failed to parse SpamAssassin response: ${err.message}`);
        resolve({ score: 0, threshold: config.spamThreshold, tests: [] });
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      warn(`SpamAssassin error: ${err.message}`);
      // Don't reject, just return default values
      resolve({ score: 0, threshold: config.spamThreshold, tests: [] });
    });
  });
}

// Add spam headers to email
function addSpamHeaders(rawEmail, dnsblResult, spamResult) {
  const emailStr = rawEmail.toString();
  const headerEnd = emailStr.indexOf('\r\n\r\n');
  
  if (headerEnd === -1) {
    return rawEmail;
  }

  const headers = [
    `X-Spam-Score: ${spamResult.score}`,
    `X-Spam-Status: ${spamResult.score >= config.spamThreshold ? 'Yes' : 'No'}, score=${spamResult.score} required=${config.spamThreshold}`,
    `X-Spam-Tests: ${spamResult.tests.join(', ')}`
  ];

  if (dnsblResult.isListed) {
    headers.push(`X-Spam-DNSBL: Listed on ${dnsblResult.listings.join(', ')}`);
  }

  const newEmail = 
    emailStr.substring(0, headerEnd) + '\r\n' +
    headers.join('\r\n') + '\r\n' +
    emailStr.substring(headerEnd);

  return Buffer.from(newEmail);
}

// Forward email to Action Mailbox
async function forwardEmail(rawEmail, envelope, session) {
  try {
    // Validate envelope
    if (!envelope.mailFrom || !envelope.mailFrom.address) {
      throw new Error('Invalid sender address');
    }
    if (!envelope.rcptTo || envelope.rcptTo.length === 0) {
      throw new Error('No recipients');
    }
    
    debug(`Starting webhook forward to ${config.webhookUrl}`);
    debug(`Email size: ${rawEmail.length} bytes`);
    
    const headers = {
      'Content-Type': 'message/rfc822',
      'User-Agent': 'actionsmtp/1.0',
      'Content-Length': rawEmail.length.toString()
    };
    
    // Add basic auth if configured
    if (config.authPass) {
      debug(`Using basic authentication for webhook (user: ${config.authUser})`);
      const auth = Buffer.from(`${config.authUser}:${config.authPass}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    
    const startTime = Date.now();
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: headers,
      body: rawEmail,
      timeout: config.timeout
    });
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logWebhookResult(session, false, response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    debug(`Webhook completed in ${duration}ms`);
    logWebhookResult(session, true, response.status);
    return true;
  } catch (err) {
    if (err.name === 'FetchError' && err.code === 'ECONNREFUSED') {
      logWebhookResult(session, false, null, 'Connection refused - webhook server not reachable');
    } else if (err.name === 'AbortError' || err.message.includes('timeout')) {
      logWebhookResult(session, false, null, `Timeout after ${config.timeout}ms`);
    } else {
      logWebhookResult(session, false, null, err.message);
    }
    throw err;
  }
}

// Create custom writable stream to collect email data
class EmailCollector extends Writable {
  constructor(options) {
    super(options);
    this.chunks = [];
  }
  
  _write(chunk, encoding, callback) {
    this.chunks.push(chunk);
    callback();
  }
  
  getRawEmail() {
    return Buffer.concat(this.chunks);
  }
}

// Create SMTP server
const server = new SMTPServer({
  name: 'actionsmtp',
  banner: 'ActionSMTP - SMTP to Action Mailbox Forwarder',
  size: config.maxSize,
  hideSize: false,
  useXForward: true,
  logger: config.verbose,
  secure: false,
  authOptional: true,
  disabledCommands: ['AUTH'], // We don't require SMTP auth
  
  onConnect(session, callback) {
    log(`CONNECT - IP: ${session.remoteAddress}`);
    
    // Check DNSBL if spam checking is enabled
    if (config.spamCheck) {
      checkDNSBL(session.remoteAddress)
        .then(result => {
          if (result.isListed) {
            warn(`REJECT_CONNECT - IP: ${session.remoteAddress}, DNSBL: ${result.listings.join(', ')}`);
            callback(new Error('550 IP address blacklisted'));
          } else {
            session.dnsblResult = result;
            debug(`Connection accepted from ${session.remoteAddress}`);
            callback();
          }
        })
        .catch(err => {
          warn(`DNSBL check error for ${session.remoteAddress}: ${err.message}`);
          callback(); // Allow on error
        });
    } else {
      debug(`Connection accepted from ${session.remoteAddress} (DNSBL disabled)`);
      callback();
    }
  },
  
  onMailFrom(address, session, callback) {
    debug(`MAIL FROM: ${address.address} (IP: ${session.remoteAddress})`);
    callback();
  },
  
  onRcptTo(address, session, callback) {
    debug(`RCPT TO: ${address.address} (IP: ${session.remoteAddress})`);
    callback();
  },
  
  onData(stream, session, callback) {
    const collector = new EmailCollector();
    let streamEnded = false;
    
    logEmailInfo(session, 'EMAIL_START', `Starting data transfer`);
    
    // Handle stream errors
    stream.on('error', (err) => {
      error(`Stream error for ${session.remoteAddress}`, err);
      if (!streamEnded) {
        streamEnded = true;
        logEmailInfo(session, 'EMAIL_FAILED', 'Stream error');
        callback(new Error('451 Stream error'));
      }
    });
    
    stream.pipe(collector);
    
    stream.on('end', async () => {
      if (streamEnded) return;
      streamEnded = true;
      try {
        let rawEmail = collector.getRawEmail();
        
        // Validate email has content
        if (!rawEmail || rawEmail.length === 0) {
          logEmailInfo(session, 'EMAIL_REJECTED', 'Empty message');
          callback(new Error('550 Empty message'));
          return;
        }
        
        // Check for basic email structure
        const emailStr = rawEmail.toString();
        if (!emailStr.includes('\r\n\r\n')) {
          logEmailInfo(session, 'EMAIL_REJECTED', 'Malformed message');
          callback(new Error('550 Malformed message: missing headers'));
          return;
        }
        
        logEmailInfo(session, 'EMAIL_RECEIVED', `Size: ${rawEmail.length} bytes`);
        
        let spamResult = { score: 0, tests: [] };
        
        // Run SpamAssassin check if enabled
        if (config.spamCheck) {
          try {
            spamResult = await checkSpamAssassin(rawEmail);
            
            // Add DNSBL penalty to spam score
            if (session.dnsblResult && session.dnsblResult.isListed) {
              spamResult.score += 3.0 * session.dnsblResult.listings.length;
              spamResult.tests.push(`DNSBL_LISTED(${session.dnsblResult.listings.join(',')})`);
            }
            
            logSpamCheck(session, spamResult, session.dnsblResult || { isListed: false, listings: [] });
            
            // Reject if score exceeds reject threshold
            if (spamResult.score >= config.spamReject) {
              logEmailInfo(session, 'EMAIL_REJECTED', `Spam score: ${spamResult.score}/${config.spamReject}`);
              callback(new Error('550 Message rejected as spam'));
              return;
            }
            
            // Add spam headers
            rawEmail = addSpamHeaders(rawEmail, session.dnsblResult || { isListed: false, listings: [] }, spamResult);
            
          } catch (err) {
            warn(`SpamAssassin check failed for email from ${session.envelope?.mailFrom?.address || 'unknown'}, allowing through: ${err.message}`);
          }
        } else {
          debug('Spam checking disabled, skipping spam filters');
        }
        
        // Forward to Action Mailbox
        await forwardEmail(rawEmail, session.envelope, session);
        
        logEmailInfo(session, 'EMAIL_ACCEPTED', 'Successfully processed and forwarded');
        callback(); // Accept message
      } catch (err) {
        error('Failed to process email', err);
        logEmailInfo(session, 'EMAIL_FAILED', err.message);
        
        // Return more specific error messages
        if (err.message.includes('timeout')) {
          callback(new Error('451 Temporary failure, please retry'));
        } else if (err.message.includes('HTTP')) {
          callback(new Error('451 Webhook temporarily unavailable'));
        } else {
          callback(new Error('550 Failed to process message'));
        }
      }
    });
  }
});

// Error handling
server.on('error', (err) => {
  error('SMTP Server error', err);
});

// Start server
server.listen(config.port, config.host, () => {
  log('=== ActionSMTP Server Starting ===');
  log(`Listening on: ${config.host}:${config.port}`);
  log(`Webhook URL: ${config.webhookUrl}`);
  log(`Max message size: ${Math.round(config.maxSize / 1024 / 1024)}MB`);
  log(`Timeout: ${config.timeout}ms`);
  log(`Verbose logging: ${config.verbose ? 'enabled' : 'disabled'}`);
  
  if (config.authPass) {
    log(`Authentication: enabled (user: ${config.authUser})`);
  } else {
    log('Authentication: disabled');
  }
  
  if (config.spamCheck) {
    log(`Spam filtering: enabled`);
    log(`  SpamAssassin: ${config.spamHost}:${config.spamPort}`);
    log(`  DNSBL services: ${DNSBL_SERVICES.join(', ')}`);
    log(`  Spam threshold: ${config.spamThreshold} (flag), ${config.spamReject} (reject)`);
  } else {
    log('Spam filtering: disabled');
  }
  
  log('=== Server Ready - Waiting for connections ===');
});

// Graceful shutdown
const shutdown = () => {
  log('Shutting down...');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  error('Uncaught exception', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  error('Unhandled rejection', reason);
});
