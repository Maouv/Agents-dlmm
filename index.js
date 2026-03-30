require('dotenv').config();
const logger = require('./src/utils/logger');
const Orchestrator = require('./src/core/orchestrator');
const MotherAgent = require('./src/agents/mother');
const telegramBot = require('./src/telegram/telegramBot');
const modeManager = require('./src/control/modeManager');

// NOTE: Telegram mode manager controls which pipeline runs.
// For now, we only start the notifier; pipeline switching will be wired into orchestrator in a later pass.

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (global.orchestrator) {
    global.orchestrator.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (global.orchestrator) {
    global.orchestrator.stop();
  }
  process.exit(0);
});

// Main initialization
async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('DLMM Paper Trader - Starting');
    logger.info('='.repeat(60));

    // Verify environment
    if (!process.env.PAPER_TRADING_STARTING_BALANCE) {
      logger.warn('PAPER_TRADING_STARTING_BALANCE not set, using default: 100');
    }

    // Initialize orchestrator (but don't auto-start cycles - wait for Telegram command)
    const orchestrator = new Orchestrator();
    global.orchestrator = orchestrator;

    // Register agents
    const motherAgent = new MotherAgent();
    orchestrator.registerAgent('mother', motherAgent);

    // Initialize other agents (they auto-register event listeners)
    const ScoutAgent = require('./src/agents/analysis/scoutAgent');
    const scoutAgent = new ScoutAgent();
    orchestrator.registerAgent('scout', scoutAgent);

    // These are already singletons (module.exports = new ClassName())
    require('./src/agents/decision/decisionAgent');
    require('./src/agents/execution/executionAgent');
    require('./src/agents/memory/memoryAgent');

    // Start Telegram bot (optional)
    // It will notify mode changes and accept /paper /real commands.
    telegramBot.start();

    // Start orchestrator (will check mode and wait for command if needed)
    const cycleInterval = parseInt(process.env.CYCLE_INTERVAL_MINUTES) || 60;
    orchestrator.start(cycleInterval);

    // Check mode status
    const modeStatus = modeManager.getStatus();
    if (modeStatus.isRunning) {
      logger.success(`System started in ${modeStatus.mode.toUpperCase()} mode`);
      logger.success(`Cycle interval: ${cycleInterval} minutes`);
    } else {
      logger.info('System started in IDLE mode');
      logger.info('Send /menu to Telegram bot to start trading');
    }

    logger.success('='.repeat(60));

    // Log system state
    const state = orchestrator.getSystemState();
    logger.info('Current system state:', state);

  } catch (error) {
    logger.error('Failed to start system:', error);
    process.exit(1);
  }
}

// Start the application
main();
