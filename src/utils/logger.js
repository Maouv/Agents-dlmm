const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../data/logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.logFile = path.join(this.logDir, `system-${new Date().toISOString().split('T')[0]}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (data) {
      logLine += ` | ${JSON.stringify(data)}`;
    }
    return logLine;
  }

  log(level, message, data = null) {
    const logLine = this.formatMessage(level, message, data);

    // Console output with colors
    const colors = {
      INFO: '\x1b[36m',    // cyan
      WARN: '\x1b[33m',    // yellow
      ERROR: '\x1b[31m',   // red
      SUCCESS: '\x1b[32m', // green
      DEBUG: '\x1b[35m'    // magenta
    };
    const reset = '\x1b[0m';

    console.log(`${colors[level] || ''}${logLine}${reset}`);

    // File output
    fs.appendFileSync(this.logFile, logLine + '\n');
  }

  info(message, data = null) {
    this.log('INFO', message, data);
  }

  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  error(message, data = null) {
    this.log('ERROR', message, data);
  }

  success(message, data = null) {
    this.log('SUCCESS', message, data);
  }

  debug(message, data = null) {
    if (process.env.DEBUG === 'true') {
      this.log('DEBUG', message, data);
    }
  }
}

module.exports = new Logger();
