const logger = require('../utils/logger');
const eventBus = require('./eventBus');

class CycleManager {
  constructor(intervalMinutes = 60) {
    this.intervalMs = intervalMinutes * 60 * 1000;
    this.timer = null;
    this.isRunning = false;
    this.manualTrigger = false;

    logger.info('CycleManager initialized', { intervalMinutes });
  }

  start() {
    if (this.isRunning) {
      logger.warn('CycleManager already running');
      return;
    }

    this.isRunning = true;
    logger.success('CycleManager started', { intervalMinutes: this.intervalMs / 60000 });

    // Run first cycle immediately
    this.runCycle();

    // Schedule subsequent cycles
    this.timer = setInterval(() => {
      this.runCycle();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('CycleManager stopped');
  }

  async runCycle() {
    const cycleId = `cycle-${Date.now()}`;

    try {
      logger.info(`Starting cycle: ${cycleId}`);

      // Emit cycle start event
      eventBus.emit('cycle:start', {
        cycleId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`Cycle error: ${cycleId}`, error);
      eventBus.emit('cycle:error', {
        cycleId,
        error: error.message
      });
    }
  }

  triggerManual() {
    if (!this.isRunning) {
      logger.warn('CycleManager not running, cannot trigger manual cycle');
      return;
    }

    logger.info('Manual cycle triggered');
    this.manualTrigger = true;
    this.runCycle();
  }
}

module.exports = CycleManager;
