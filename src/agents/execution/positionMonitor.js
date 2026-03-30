const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const paperTradingEngine = require('./paperTradingEngine');
const priceFetcher = require('../../data/priceFetcher');

class PositionMonitor {
  constructor() {
    this.name = 'PositionMonitor';
    this.checkInterval = 60000; // Check every 60 seconds
    this.intervalId = null;

    logger.info(`${this.name} initialized`);
  }

  /**
   * Start monitoring active positions
   */
  start() {
    if (this.intervalId) {
      logger.warn(`${this.name}: Monitor already running`);
      return;
    }

    logger.info(`${this.name}: Starting position monitor (interval: ${this.checkInterval}ms)`);

    this.intervalId = setInterval(async () => {
      await this.checkPositions();
    }, this.checkInterval);

    // Run initial check
    this.checkPositions();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info(`${this.name}: Position monitor stopped`);
    }
  }

  /**
   * Check all active positions for exit conditions
   */
  async checkPositions() {
    try {
      const activePositions = paperTradingEngine.getActivePositions();

      if (activePositions.length === 0) {
        logger.debug(`${this.name}: No active positions to monitor`);
        return;
      }

      logger.info(`${this.name}: Checking ${activePositions.length} active positions`);

      // Fetch current prices for all positions
      const poolAddresses = activePositions.map(p => p.pool_address);
      const currentPrices = await this.fetchCurrentPrices(poolAddresses);

      // Check exit conditions
      const exits = paperTradingEngine.checkExitConditions(currentPrices);

      if (exits.length === 0) {
        logger.debug(`${this.name}: No exit conditions triggered`);
        return;
      }

      logger.info(`${this.name}: ${exits.length} positions triggering exit`);

      // Process exits
      for (const exit of exits) {
        await this.processExit(exit);
      }

    } catch (error) {
      logger.error(`${this.name}: Error checking positions`, error);
    }
  }

  /**
   * Fetch current prices for pools
   */
  async fetchCurrentPrices(poolAddresses) {
    const prices = {};

    for (const address of poolAddresses) {
      try {
        // In real trading, would fetch from DLMM SDK or Jupiter
        // For paper trading, use priceFetcher or simulate
        const priceData = await priceFetcher.fetchPrice(address);
        prices[address] = priceData?.price_usd || 0;
      } catch (error) {
        logger.error(`${this.name}: Error fetching price for ${address}`, error);
        prices[address] = 0;
      }
    }

    return prices;
  }

  /**
   * Process position exit
   */
  async processExit(exit) {
    logger.info(`${this.name}: Processing exit for position ${exit.positionId}`);
    logger.info(`${this.name}: Exit reason: ${exit.reason}`);
    logger.info(`${this.name}: Unrealized PnL: $${exit.metrics.unrealized_pnl_usd.toFixed(2)} (${exit.metrics.unrealized_pnl_percent.toFixed(2)}%)`);

    // Close position via Execution Agent
    eventBus.emit('position:exit', {
      positionId: exit.positionId,
      reason: exit.reason,
      metrics: exit.metrics
    });
  }

  /**
   * Get position status report
   */
  getStatusReport() {
    const activePositions = paperTradingEngine.getActivePositions();

    return {
      active_count: activePositions.length,
      positions: activePositions.map(p => ({
        id: p.id,
        token_symbol: p.token_symbol,
        entry_price: p.entry_price,
        position_size: p.position_size,
        hold_hours: (Date.now() - p.entry_timestamp) / (1000 * 60 * 60),
        strategy: p.strategy.type
      })),
      monitor_running: this.intervalId !== null
    };
  }
}

module.exports = new PositionMonitor();
