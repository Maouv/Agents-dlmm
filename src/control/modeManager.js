const logger = require('../utils/logger');
const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');

class ModeManager {
  constructor() {
    this.name = 'ModeManager';
    this.currentMode = null; // 'paper' | 'real' | null
    this.status = 'stopped'; // 'running' | 'stopped'

    // Initialize database table for mode persistence
    this.db = stateManager.db;
    this.initializeTable();
    this.loadState();

    logger.info(`${this.name} initialized (current mode: ${this.currentMode || 'none'}, status: ${this.status})`);
  }

  /**
   * Initialize mode state table
   */
  initializeTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS mode_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT,
        status TEXT DEFAULT 'stopped',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Insert default state if not exists
    const existing = this.db.prepare('SELECT * FROM mode_state WHERE id = 1').get();
    if (!existing) {
      this.db.prepare('INSERT INTO mode_state (id, mode, status) VALUES (1, NULL, ?)').run('stopped');
    }
  }

  /**
   * Load state from database
   */
  loadState() {
    const state = this.db.prepare('SELECT * FROM mode_state WHERE id = 1').get();
    if (state) {
      this.currentMode = state.mode;
      this.status = state.status;
      logger.debug(`${this.name}: Loaded state from DB - mode: ${this.currentMode}, status: ${this.status}`);
    }
  }

  /**
   * Save state to database
   */
  saveState() {
    this.db.prepare(`
      UPDATE mode_state
      SET mode = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(this.currentMode, this.status);
  }

  /**
   * Start paper trading mode
   */
  startPaper() {
    if (this.currentMode === 'paper' && this.status === 'running') {
      return {
        success: false,
        message: 'Paper trading is already running'
      };
    }

    // Stop real mode if running
    if (this.currentMode === 'real' && this.status === 'running') {
      logger.warn(`${this.name}: Real trading is running, stopping it first`);
      this.stopReal();
    }

    // Start paper mode
    this.currentMode = 'paper';
    this.status = 'running';
    this.saveState();

    logger.success(`${this.name}: Paper trading started`);

    // Emit event for pipeline
    eventBus.emit('mode:start', {
      mode: 'paper',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Paper trading started successfully'
    };
  }

  /**
   * Stop paper trading mode
   */
  stopPaper() {
    if (this.currentMode !== 'paper') {
      return {
        success: false,
        message: 'Paper trading is not active'
      };
    }

    if (this.status === 'stopped') {
      return {
        success: false,
        message: 'Paper trading is already stopped'
      };
    }

    // Stop paper mode
    this.status = 'stopped';
    this.saveState();

    logger.success(`${this.name}: Paper trading stopped`);

    // Emit event for pipeline
    eventBus.emit('mode:stop', {
      mode: 'paper',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Paper trading stopped successfully'
    };
  }

  /**
   * Start real trading mode
   */
  startReal() {
    if (this.currentMode === 'real' && this.status === 'running') {
      return {
        success: false,
        message: 'Real trading is already running'
      };
    }

    // Stop paper mode if running
    if (this.currentMode === 'paper' && this.status === 'running') {
      logger.warn(`${this.name}: Paper trading is running, stopping it first`);
      const stopResult = this.stopPaper();
      logger.info(`${this.name}: Paper trading stopped before real start`);

      // Emit warning event
      eventBus.emit('mode:warning', {
        message: 'Paper trading stopped before starting real trading',
        timestamp: new Date().toISOString()
      });
    }

    // Start real mode
    this.currentMode = 'real';
    this.status = 'running';
    this.saveState();

    logger.success(`${this.name}: Real trading started`);

    // Emit event for pipeline
    eventBus.emit('mode:start', {
      mode: 'real',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Real trading started successfully (paper trading was stopped if it was running)'
    };
  }

  /**
   * Stop real trading mode
   */
  stopReal() {
    if (this.currentMode !== 'real') {
      return {
        success: false,
        message: 'Real trading is not active'
      };
    }

    if (this.status === 'stopped') {
      return {
        success: false,
        message: 'Real trading is already stopped'
      };
    }

    // Stop real mode
    this.status = 'stopped';
    this.saveState();

    logger.success(`${this.name}: Real trading stopped`);

    // Emit event for pipeline
    eventBus.emit('mode:stop', {
      mode: 'real',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Real trading stopped successfully'
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      mode: this.currentMode || 'none',
      status: this.status,
      isRunning: this.status === 'running',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new ModeManager();
