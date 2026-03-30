const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

class StateManager {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/agents.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
    logger.info('StateManager initialized', { dbPath });
  }

  initTables() {
    // System state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cycle_count INTEGER DEFAULT 0,
        last_cycle_start TIMESTAMP,
        last_cycle_end TIMESTAMP,
        active_positions TEXT DEFAULT '[]',
        current_models TEXT DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize system state if not exists
    const initStmt = this.db.prepare('INSERT OR IGNORE INTO system_state (id) VALUES (1)');
    initStmt.run();

    // Pools
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pools (
        pool_address TEXT PRIMARY KEY,
        token_symbol TEXT,
        token_address TEXT,
        base_fee REAL,
        tvl REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Price history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pool_address TEXT,
        price REAL,
        ath_price REAL,
        bottom_price REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_address) REFERENCES pools(pool_address)
      )
    `);

    // Positions (for paper trading)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        position_id TEXT PRIMARY KEY,
        pool_address TEXT,
        strategy TEXT,
        entry_price REAL,
        position_size REAL,
        current_price REAL,
        fees_earned REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        bottom_price REAL,
        ath_price REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_address) REFERENCES pools(pool_address)
      )
    `);

    // Portfolio state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portfolio_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_balance REAL DEFAULT 0,
        available_balance REAL DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize portfolio state
    const initPortfolio = this.db.prepare('INSERT OR IGNORE INTO portfolio_state (id, total_balance, available_balance) VALUES (1, 0, 0)');
    initPortfolio.run();

    // Trades
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_id TEXT PRIMARY KEY,
        pool_address TEXT,
        token_symbol TEXT,
        strategy TEXT,
        entry_price REAL,
        exit_price REAL,
        entry_reason TEXT,
        exit_reason TEXT,
        position_size REAL,
        pnl_usd REAL,
        pnl_percentage REAL,
        fees_earned REAL,
        total_return REAL,
        time_held_minutes INTEGER,
        entry_timestamp TIMESTAMP,
        exit_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Patterns (for journal)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT,
        strategy TEXT,
        metric_name TEXT,
        metric_value REAL,
        sample_size INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Agent decisions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT,
        agent_name TEXT,
        decision TEXT,
        reasoning TEXT,
        confidence REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Performance metrics
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        total_trades INTEGER,
        win_rate REAL,
        total_pnl REAL,
        avg_return REAL,
        sharpe_ratio REAL,
        max_drawdown REAL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Database tables initialized');
  }

  // System state methods
  getSystemState() {
    const stmt = this.db.prepare('SELECT * FROM system_state WHERE id = 1');
    return stmt.get();
  }

  updateSystemState(updates) {
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
    const stmt = this.db.prepare(`UPDATE system_state SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`);
    stmt.run(updates);
    logger.debug('System state updated', updates);
  }

  incrementCycleCount() {
    const stmt = this.db.prepare('UPDATE system_state SET cycle_count = cycle_count + 1, last_cycle_start = CURRENT_TIMESTAMP WHERE id = 1');
    stmt.run();
  }

  // Portfolio methods
  getPortfolioState() {
    const stmt = this.db.prepare('SELECT * FROM portfolio_state WHERE id = 1');
    return stmt.get();
  }

  updatePortfolioState(updates) {
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
    const stmt = this.db.prepare(`UPDATE portfolio_state SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`);
    stmt.run(updates);
    logger.debug('Portfolio state updated', updates);
  }

  // Pool methods
  upsertPool(pool) {
    const stmt = this.db.prepare(`
      INSERT INTO pools (pool_address, token_symbol, token_address, base_fee, tvl)
      VALUES (@pool_address, @token_symbol, @token_address, @base_fee, @tvl)
      ON CONFLICT(pool_address) DO UPDATE SET
        token_symbol = @token_symbol,
        base_fee = @base_fee,
        tvl = @tvl
    `);
    stmt.run(pool);
  }

  // Price history methods
  addPriceHistory(data) {
    const stmt = this.db.prepare(`
      INSERT INTO price_history (pool_address, price, ath_price, bottom_price)
      VALUES (@pool_address, @price, @ath_price, @bottom_price)
    `);
    stmt.run(data);
  }

  // Position methods
  createPosition(position) {
    const stmt = this.db.prepare(`
      INSERT INTO positions (
        position_id, pool_address, strategy, entry_price, position_size,
        current_price, bottom_price, ath_price, status
      )
      VALUES (
        @position_id, @pool_address, @strategy, @entry_price, @position_size,
        @current_price, @bottom_price, @ath_price, 'open'
      )
    `);
    stmt.run(position);
    logger.info('Position created', { positionId: position.position_id });
  }

  updatePosition(positionId, updates) {
    const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
    const stmt = this.db.prepare(`UPDATE positions SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE position_id = @position_id`);
    stmt.run({ position_id: positionId, ...updates });
    logger.debug('Position updated', { positionId, updates });
  }

  getActivePositions() {
    const stmt = this.db.prepare("SELECT * FROM positions WHERE status = 'open'");
    return stmt.all();
  }

  // Trade methods
  recordTrade(trade) {
    const stmt = this.db.prepare(`
      INSERT INTO trades (
        trade_id, pool_address, token_symbol, strategy, entry_price, exit_price,
        entry_reason, exit_reason, position_size, pnl_usd, pnl_percentage,
        fees_earned, total_return, time_held_minutes, entry_timestamp
      )
      VALUES (
        @trade_id, @pool_address, @token_symbol, @strategy, @entry_price, @exit_price,
        @entry_reason, @exit_reason, @position_size, @pnl_usd, @pnl_percentage,
        @fees_earned, @total_return, @time_held_minutes, @entry_timestamp
      )
    `);
    stmt.run(trade);
    logger.info('Trade recorded', { tradeId: trade.trade_id });
  }

  // Pattern methods
  upsertPattern(pattern) {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (pattern_type, strategy, metric_name, metric_value, sample_size)
      VALUES (@pattern_type, @strategy, @metric_name, @metric_value, @sample_size)
      ON CONFLICT DO UPDATE SET
        metric_value = @metric_value,
        sample_size = @sample_size,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(pattern);
  }

  getPatternsByStrategy(strategy) {
    const stmt = this.db.prepare('SELECT * FROM patterns WHERE strategy = ?');
    return stmt.all(strategy);
  }

  // Agent decision methods
  recordAgentDecision(decision) {
    const stmt = this.db.prepare(`
      INSERT INTO agent_decisions (trade_id, agent_name, decision, reasoning, confidence)
      VALUES (@trade_id, @agent_name, @decision, @reasoning, @confidence)
    `);
    stmt.run(decision);
  }

  // Performance methods
  recordPerformance(metrics) {
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (
        date, total_trades, win_rate, total_pnl, avg_return, sharpe_ratio, max_drawdown
      )
      VALUES (@date, @total_trades, @win_rate, @total_pnl, @avg_return, @sharpe_ratio, @max_drawdown)
    `);
    stmt.run(metrics);
  }

  close() {
    this.db.close();
    logger.info('Database connection closed');
  }
}

module.exports = new StateManager();
