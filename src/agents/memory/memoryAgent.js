const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const stateManager = require('../../core/stateManager');

class MemoryAgent {
  constructor() {
    this.name = 'MemoryAgent';
    this.model = 'qwen3-32b';
    this.provider = 'groq';
    this.temperature = 0.4; // Higher for pattern extraction

    // Trade journal database
    this.db = stateManager.db;

    logger.info(`${this.name} initialized`);
    this.setupListeners();
    this.initializeTables();
  }

  setupListeners() {
    // Listen for trade executions (from Execution Agent - Phase 5)
    eventBus.on('execution:complete', async (data) => {
      await this.recordTrade(data);
    });

    // Listen for trade exits
    eventBus.on('trade:exit', async (data) => {
      await this.updateTradeExit(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  /**
   * Initialize trade journal tables
   */
  initializeTables() {
    // Trade history table
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS trade_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pool_address TEXT NOT NULL,
        token_symbol TEXT,
        decision TEXT,
        entry_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        exit_timestamp DATETIME,
        position_size_usd REAL,
        entry_price REAL,
        exit_price REAL,
        pnl_usd REAL,
        pnl_percent REAL,
        hold_hours REAL,
        strategy_type TEXT,
        bin_step INTEGER,
        lper_confidence TEXT,
        lper_win_rate REAL,
        pool_tvl REAL,
        pool_volume REAL,
        volatility REAL,
        entry_reasoning TEXT,
        exit_reason TEXT,
        lessons TEXT
      )
    `).run();

    // Pattern library table
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS pattern_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        condition TEXT NOT NULL,
        outcome TEXT NOT NULL,
        success_rate REAL,
        sample_size INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pattern_type, condition, outcome)
      )
    `).run();

    logger.debug(`${this.name}: Trade journal tables initialized`);
  }

  /**
   * Record new trade entry
   */
  async recordTrade(data) {
    try {
      logger.info(`${this.name}: Recording trade entry for ${data.token_symbol}`);

      const stmt = this.db.prepare(`
        INSERT INTO trade_journal (
          pool_address, token_symbol, decision, position_size_usd,
          entry_price, strategy_type, bin_step, lper_confidence,
          lper_win_rate, pool_tvl, pool_volume, volatility, entry_reasoning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.pool_address,
        data.token_symbol,
        data.decision,
        data.position_size,
        data.entry_price || 0,
        data.strategy?.type || 'unknown',
        data.strategy?.bin_step || 0,
        data.lper_insights?.confidence || 'none',
        data.lper_insights?.avg_win_rate || 0,
        data.pool_metrics?.tvl || 0,
        data.pool_metrics?.volume_24h || 0,
        data.pool_metrics?.volatility || 0,
        data.reasoning || ''
      );

      logger.success(`${this.name}: Trade recorded with ID ${result.lastInsertRowid}`);

      return result.lastInsertRowid;

    } catch (error) {
      logger.error(`${this.name}: Error recording trade`, error);
      throw error;
    }
  }

  /**
   * Update trade exit
   */
  async updateTradeExit(data) {
    try {
      logger.info(`${this.name}: Recording trade exit for ${data.pool_address}`);

      const stmt = this.db.prepare(`
        UPDATE trade_journal
        SET exit_timestamp = CURRENT_TIMESTAMP,
            exit_price = ?,
            pnl_usd = ?,
            pnl_percent = ?,
            hold_hours = ?,
            exit_reason = ?
        WHERE pool_address = ? AND exit_timestamp IS NULL
        ORDER BY entry_timestamp DESC
        LIMIT 1
      `);

      stmt.run(
        data.exit_price,
        data.pnl_usd,
        data.pnl_percent,
        data.hold_hours,
        data.exit_reason || '',
        data.pool_address
      );

      // Extract lessons from this trade
      await this.extractLessons(data.pool_address);

      logger.success(`${this.name}: Trade exit recorded`);

    } catch (error) {
      logger.error(`${this.name}: Error updating trade exit`, error);
      throw error;
    }
  }

  /**
   * Extract lessons from completed trades
   */
  async extractLessons(poolAddress) {
    try {
      logger.info(`${this.name}: Extracting lessons from trade ${poolAddress}`);

      // Get the completed trade
      const trade = this.db.prepare(`
        SELECT * FROM trade_journal
        WHERE pool_address = ? AND exit_timestamp IS NOT NULL
        ORDER BY exit_timestamp DESC
        LIMIT 1
      `).get(poolAddress);

      if (!trade) {
        logger.warn(`${this.name}: No completed trade found`);
        return;
      }

      const lessons = [];

      // 1. Analyze LPers data quality
      if (trade.lper_win_rate >= 0.65 && trade.pnl_percent > 0) {
        lessons.push({
          type: 'PREFER',
          condition: `LPers win_rate >= ${(trade.lper_win_rate * 100).toFixed(0)}%`,
          outcome: 'profitable_trade',
          context: `Win rate: ${(trade.lper_win_rate * 100).toFixed(1)}%, PnL: ${trade.pnl_percent.toFixed(2)}%`
        });
      } else if (trade.lper_win_rate >= 0.65 && trade.pnl_percent <= 0) {
        lessons.push({
          type: 'FAILED',
          condition: `LPers win_rate >= ${(trade.lper_win_rate * 100).toFixed(0)}%`,
          outcome: 'loss_trade',
          context: `Win rate high but trade failed. Check other factors.`
        });
      }

      // 2. Analyze volatility impact
      if (trade.volatility > 2.5 && trade.pnl_percent < -10) {
        lessons.push({
          type: 'FAILED',
          condition: `volatility > 2.5`,
          outcome: 'large_loss',
          context: `Volatility: ${trade.volatility.toFixed(2)}, Loss: ${trade.pnl_percent.toFixed(2)}%`
        });
      }

      // 3. Analyze hold time
      if (trade.hold_hours > 6 && trade.pnl_percent < 0) {
        lessons.push({
          type: 'FAILED',
          condition: `hold_hours > 6`,
          outcome: 'extended_loss',
          context: `Held for ${trade.hold_hours.toFixed(1)}h with loss`
        });
      }

      // 4. Analyze strategy effectiveness
      if (trade.strategy_type === 'bid_ask' && trade.pnl_percent > 5) {
        lessons.push({
          type: 'PREFER',
          condition: `strategy = bid_ask`,
          outcome: 'good_profit',
          context: `PnL: ${trade.pnl_percent.toFixed(2)}%`
        });
      }

      // 5. Analyze TVL impact
      if (trade.pool_tvl < 30000 && trade.pnl_percent < -8) {
        lessons.push({
          type: 'FAILED',
          condition: `TVL < $30k`,
          outcome: 'risky_trade',
          context: `TVL: $${trade.pool_tvl.toFixed(0)}, Loss: ${trade.pnl_percent.toFixed(2)}%`
        });
      }

      // Save lessons to database
      for (const lesson of lessons) {
        this.upsertPattern(lesson);
      }

      // Update trade with lessons
      if (lessons.length > 0) {
        const lessonsJson = JSON.stringify(lessons);
        this.db.prepare(`
          UPDATE trade_journal
          SET lessons = ?
          WHERE pool_address = ? AND exit_timestamp IS NOT NULL
          ORDER BY exit_timestamp DESC
          LIMIT 1
        `).run(lessonsJson, poolAddress);
      }

      logger.success(`${this.name}: Extracted ${lessons.length} lessons from trade`);

      // Emit lessons learned
      eventBus.emit('memory:lessons', {
        pool_address: poolAddress,
        lessons,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`${this.name}: Error extracting lessons`, error);
    }
  }

  /**
   * Upsert pattern to library
   */
  upsertPattern(pattern) {
    const stmt = this.db.prepare(`
      INSERT INTO pattern_library (pattern_type, condition, outcome, success_rate, sample_size)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(pattern_type, condition, outcome)
      DO UPDATE SET
        success_rate = CASE
          WHEN outcome = 'profitable_trade' OR outcome = 'good_profit'
          THEN (success_rate * sample_size + 1) / (sample_size + 1)
          ELSE success_rate
        END,
        sample_size = sample_size + 1,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(
      pattern.type,
      pattern.condition,
      pattern.outcome,
      pattern.outcome.includes('profit') || pattern.outcome.includes('good') ? 1.0 : 0.0
    );
  }

  /**
   * Get relevant patterns for a condition
   */
  getRelevantPools(condition) {
    const stmt = this.db.prepare(`
      SELECT * FROM pattern_library
      WHERE condition LIKE ?
      ORDER BY
        CASE WHEN pattern_type = 'PREFER' THEN 1 ELSE 2 END,
        success_rate DESC,
        sample_size DESC
      LIMIT 10
    `);

    return stmt.all(`%${condition}%`);
  }

  /**
   * Get trade history
   */
  getTradeHistory(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM trade_journal
      ORDER BY entry_timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get performance stats
   */
  getPerformanceStats() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN pnl_usd <= 0 THEN 1 ELSE 0 END) as losing_trades,
        AVG(pnl_percent) as avg_pnl_percent,
        AVG(hold_hours) as avg_hold_hours,
        AVG(CASE WHEN pnl_usd > 0 THEN pnl_percent END) as avg_win,
        AVG(CASE WHEN pnl_usd <= 0 THEN pnl_percent END) as avg_loss
      FROM trade_journal
      WHERE exit_timestamp IS NOT NULL
    `).get();

    return {
      total_trades: stats.total_trades || 0,
      winning_trades: stats.winning_trades || 0,
      losing_trades: stats.losing_trades || 0,
      win_rate: stats.total_trades > 0 ? (stats.winning_trades / stats.total_trades) : 0,
      avg_pnl_percent: stats.avg_pnl_percent || 0,
      avg_hold_hours: stats.avg_hold_hours || 0,
      avg_win: stats.avg_win || 0,
      avg_loss: stats.avg_loss || 0
    };
  }
}

module.exports = new MemoryAgent();
