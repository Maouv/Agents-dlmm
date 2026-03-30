const logger = require('../../utils/logger');
const stateManager = require('../../core/stateManager');

class PaperTradingEngine {
  constructor() {
    this.name = 'PaperTradingEngine';
    this.db = stateManager.db;

    // Active positions cache
    this.activePositions = new Map();

    logger.info(`${this.name} initialized`);
    this.initializeTables();
    this.loadActivePositions();
  }

  /**
   * Initialize positions tables
   */
  initializeTables() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS paper_positions (
        id TEXT PRIMARY KEY,
        pool_address TEXT NOT NULL,
        token_symbol TEXT,
        status TEXT DEFAULT 'active',
        strategy_type TEXT,
        bin_step INTEGER,
        bin_range_lower INTEGER,
        bin_range_upper INTEGER,
        position_size_usd REAL,
        entry_price REAL,
        exit_price REAL,
        entry_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        exit_timestamp DATETIME,
        pnl_usd REAL,
        pnl_percent REAL,
        hold_hours REAL,
        stop_loss_percent REAL,
        take_profit_percent REAL,
        max_hold_hours REAL,
        exit_reason TEXT
      )
    `).run();

    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS paper_position_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        current_price REAL,
        unrealized_pnl_usd REAL,
        unrealized_pnl_percent REAL,
        FOREIGN KEY (position_id) REFERENCES paper_positions(id)
      )
    `).run();

    logger.debug(`${this.name}: Position tables initialized`);
  }

  /**
   * Load active positions from database on restart
   */
  loadActivePositions() {
    const positions = this.db.prepare(`
      SELECT * FROM paper_positions WHERE status = 'active'
    `).all();

    positions.forEach(pos => {
      this.activePositions.set(pos.id, {
        id: pos.id,
        pool_address: pos.pool_address,
        token_symbol: pos.token_symbol,
        strategy: {
          type: pos.strategy_type,
          bin_step: pos.bin_step,
          bin_range: {
            lower_bin_id: pos.bin_range_lower,
            upper_bin_id: pos.bin_range_upper
          }
        },
        position_size: pos.position_size_usd,
        entry_price: pos.entry_price,
        entry_timestamp: new Date(pos.entry_timestamp),
        risk_params: {
          stop_loss_percent: pos.stop_loss_percent,
          take_profit_percent: pos.take_profit_percent,
          max_hold_hours: pos.max_hold_hours
        }
      });
    });

    logger.info(`${this.name}: Loaded ${positions.length} active positions`);
  }

  /**
   * Generate unique position ID
   */
  generatePositionId(poolAddress) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `pos_${poolAddress.slice(0, 8)}_${timestamp}_${random}`;
  }

  /**
   * Open new position
   */
  openPosition(params) {
    try {
      logger.info(`${this.name}: Opening position for ${params.token_symbol}`);

      // Generate position ID
      const positionId = this.generatePositionId(params.pool_address);

      // Simulate entry price (in real trading, would fetch from DLMM SDK)
      const entryPrice = this.simulateEntryPrice(params.pool_metrics);

      // Create position object
      const position = {
        id: positionId,
        pool_address: params.pool_address,
        token_symbol: params.token_symbol,
        strategy: params.strategy,
        position_size: params.position_size,
        entry_price: entryPrice,
        entry_timestamp: new Date(),
        risk_params: params.risk_params,
        lper_insights: params.lper_insights,
        pool_metrics: params.pool_metrics,
        reasoning: params.reasoning,
        confidence: params.confidence
      };

      // Save to database
      const stmt = this.db.prepare(`
        INSERT INTO paper_positions (
          id, pool_address, token_symbol, strategy_type, bin_step,
          bin_range_lower, bin_range_upper, position_size_usd, entry_price,
          stop_loss_percent, take_profit_percent, max_hold_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        positionId,
        params.pool_address,
        params.token_symbol,
        params.strategy.type,
        params.strategy.bin_step,
        params.strategy.bin_range.lower_bin_id,
        params.strategy.bin_range.upper_bin_id,
        params.position_size,
        entryPrice,
        params.risk_params.stop_loss_percent,
        params.risk_params.take_profit_percent,
        params.risk_params.max_hold_hours
      );

      // Add to active positions
      this.activePositions.set(positionId, position);

      logger.success(`${this.name}: Position ${positionId} opened`);
      logger.info(`${this.name}: Entry: $${entryPrice.toFixed(6)}, Size: $${params.position_size}`);

      return position;

    } catch (error) {
      logger.error(`${this.name}: Error opening position`, {
        message: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      return null;
    }
  }

  /**
   * Close position
   */
  closePosition(positionId, reason = 'manual') {
    try {
      const position = this.activePositions.get(positionId);

      if (!position) {
        logger.warn(`${this.name}: Position ${positionId} not found`);
        return null;
      }

      logger.info(`${this.name}: Closing position ${positionId}`);

      // Simulate exit price
      const exitPrice = this.simulateExitPrice(position.entry_price, position.pool_metrics);

      // Calculate PnL
      const priceChange = exitPrice - position.entry_price;
      const pnlPercent = (priceChange / position.entry_price) * 100;
      const pnlUsd = position.position_size * (pnlPercent / 100);

      // Calculate hold time
      const exitTimestamp = new Date();
      const holdHours = (exitTimestamp - position.entry_timestamp) / (1000 * 60 * 60);

      // Update database
      this.db.prepare(`
        UPDATE paper_positions
        SET status = 'closed',
            exit_price = ?,
            exit_timestamp = ?,
            pnl_usd = ?,
            pnl_percent = ?,
            hold_hours = ?,
            exit_reason = ?
        WHERE id = ?
      `).run(exitPrice, exitTimestamp.toISOString(), pnlUsd, pnlPercent, holdHours, reason, positionId);

      // Remove from active positions
      this.activePositions.delete(positionId);

      const result = {
        id: positionId,
        pool_address: position.pool_address,
        token_symbol: position.token_symbol,
        entry_price: position.entry_price,
        exit_price: exitPrice,
        pnl_usd: pnlUsd,
        pnl_percent: pnlPercent,
        hold_hours: holdHours,
        exit_reason: reason
      };

      logger.success(`${this.name}: Position ${positionId} closed`);
      logger.info(`${this.name}: PnL: $${pnlUsd.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

      return result;

    } catch (error) {
      logger.error(`${this.name}: Error closing position`, error);
      return null;
    }
  }

  /**
   * Get position metrics
   */
  getPositionMetrics(positionId, currentPrice) {
    const position = this.activePositions.get(positionId);

    if (!position) {
      return null;
    }

    const priceChange = currentPrice - position.entry_price;
    const unrealizedPnlPercent = (priceChange / position.entry_price) * 100;
    const unrealizedPnlUsd = position.position_size * (unrealizedPnlPercent / 100);

    return {
      position_id: positionId,
      current_price: currentPrice,
      unrealized_pnl_usd: unrealizedPnlUsd,
      unrealized_pnl_percent: unrealizedPnlPercent,
      entry_price: position.entry_price,
      position_size: position.position_size
    };
  }

  /**
   * Get all active positions
   */
  getActivePositions() {
    return Array.from(this.activePositions.values());
  }

  /**
   * Simulate entry price (mock for paper trading)
   */
  simulateEntryPrice(poolMetrics) {
    // In real trading, would fetch from DLMM SDK
    // For now, simulate based on volatility
    const basePrice = 0.85; // Mock base price
    const volatility = poolMetrics?.volatility || 1.5;
    const randomFactor = 1 + (Math.random() - 0.5) * (volatility * 0.1);

    return basePrice * randomFactor;
  }

  /**
   * Simulate exit price (mock for paper trading)
   */
  simulateExitPrice(entryPrice, poolMetrics) {
    // In real trading, would fetch from DLMM SDK
    // For now, simulate based on volatility
    const volatility = poolMetrics?.volatility || 1.5;
    const randomFactor = 1 + (Math.random() - 0.5) * (volatility * 0.15);

    return entryPrice * randomFactor;
  }

  /**
   * Check exit conditions for all active positions
   */
  checkExitConditions(currentPrices) {
    const exits = [];

    for (const [positionId, position] of this.activePositions.entries()) {
      const currentPrice = currentPrices[position.pool_address] || position.entry_price;
      const metrics = this.getPositionMetrics(positionId, currentPrice);

      if (!metrics) continue;

      // Check stop loss
      if (metrics.unrealized_pnl_percent <= -(position.risk_params.stop_loss_percent * 100)) {
        exits.push({
          positionId,
          reason: 'stop_loss',
          metrics
        });
        continue;
      }

      // Check take profit
      if (metrics.unrealized_pnl_percent >= (position.risk_params.take_profit_percent * 100)) {
        exits.push({
          positionId,
          reason: 'take_profit',
          metrics
        });
        continue;
      }

      // Check max hold time
      const holdHours = (Date.now() - position.entry_timestamp) / (1000 * 60 * 60);
      if (holdHours >= position.risk_params.max_hold_hours) {
        exits.push({
          positionId,
          reason: 'max_hold_time',
          metrics
        });
        continue;
      }
    }

    return exits;
  }
}

module.exports = new PaperTradingEngine();
