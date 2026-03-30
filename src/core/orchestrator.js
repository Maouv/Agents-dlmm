const EventEmitter = require('events');
const logger = require('../utils/logger');
const eventBus = require('./eventBus');
const stateManager = require('./stateManager');
const CycleManager = require('./cycleManager');
// const dataAggregator = require('../data'); // Rug Me strategy (commented for future use)
const dataAggregator = require('../data/aggregator-v2'); // Copy Trade Top LPers strategy
const modeManager = require('../control/modeManager');

class Orchestrator {
  constructor() {
    this.cycleManager = null;
    this.agents = new Map();
    this.currentCycleData = {};

    logger.info('Orchestrator initialized');
  }

  registerAgent(name, agent) {
    this.agents.set(name, agent);
    logger.info(`Agent registered: ${name}`);
  }

  start(cycleIntervalMinutes = 60) {
    logger.info('Starting orchestrator...');

    // Setup event listeners
    this.setupEventListeners();

    // Setup mode event listeners
    this.setupModeListeners();

    // Initialize cycle manager (but don't start yet - wait for mode)
    this.cycleManager = new CycleManager(cycleIntervalMinutes);

    // Check if mode is already running (from DB state)
    const status = modeManager.getStatus();
    if (status.isRunning) {
      logger.info(`Mode ${status.mode} is active, starting cycles...`);
      this.cycleManager.start();
    } else {
      logger.info('No active mode, waiting for Telegram command to start');
    }

    logger.success('Orchestrator started successfully');
  }

  stop() {
    if (this.cycleManager) {
      this.cycleManager.stop();
    }
    logger.info('Orchestrator stopped');
  }

  setupModeListeners() {
    // Listen for mode start
    eventBus.on('mode:start', (data) => {
      logger.info(`Mode ${data.mode} started, starting cycle manager...`);
      if (this.cycleManager && !this.cycleManager.isRunning) {
        this.cycleManager.start();
      }
    });

    // Listen for mode stop
    eventBus.on('mode:stop', (data) => {
      logger.info(`Mode ${data.mode} stopped, stopping cycle manager...`);
      if (this.cycleManager && this.cycleManager.isRunning) {
        this.cycleManager.stop();
      }
    });

    logger.debug('Mode event listeners setup complete');
  }

  setupEventListeners() {
    // Cycle events
    eventBus.on('cycle:start', async (data) => {
      logger.info('Event: cycle:start', data);
      stateManager.incrementCycleCount();
      this.currentCycleData = {
        cycleId: data.cycleId,
        startTime: data.timestamp
      };

      // Trigger data aggregation (Phase 2)
      try {
        await dataAggregator.aggregate();
      } catch (error) {
        logger.error('Data aggregation failed', error);
        eventBus.emit('cycle:error', {
          cycleId: data.cycleId,
          error: error.message
        });
      }
    });

    eventBus.on('cycle:complete', (data) => {
      logger.success('Event: cycle:complete', data);
      stateManager.updateSystemState({
        last_cycle_end: new Date().toISOString()
      });
      this.currentCycleData = {};
    });

    eventBus.on('cycle:error', (data) => {
      logger.error('Event: cycle:error', data);
      stateManager.updateSystemState({
        last_cycle_end: new Date().toISOString()
      });
    });

    // Agent events
    eventBus.on('agent:error', (data) => {
      logger.error('Event: agent:error', data);
    });

    eventBus.on('fallback:triggered', (data) => {
      logger.warn('Event: fallback:triggered', data);
    });

    // Data events (Phase 2)
    eventBus.on('data:ready', (data) => {
      logger.success('Event: data:ready', data.stats);
      // TODO: Pass to Analysis Agents in Phase 3
    });

    eventBus.on('data:error', (data) => {
      logger.error('Event: data:error', data);
    });

    logger.debug('Event listeners setup complete');
  }

  triggerManualCycle() {
    // Check if mode is active before manual cycle
    const status = modeManager.getStatus();
    if (!status.isRunning) {
      logger.warn('Cannot trigger manual cycle - no active mode');
      return;
    }

    if (this.cycleManager) {
      this.cycleManager.triggerManual();
    } else {
      logger.warn('CycleManager not initialized');
    }
  }

  getSystemState() {
    return stateManager.getSystemState();
  }
}

module.exports = Orchestrator;
