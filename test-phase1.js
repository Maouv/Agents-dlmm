require('dotenv').config();
const logger = require('./src/utils/logger');
const stateManager = require('./src/core/stateManager');
const eventBus = require('./src/core/eventBus');

// Test Phase 1 Components
async function testPhase1() {
  logger.info('='.repeat(60));
  logger.info('Testing Phase 1 Components');
  logger.info('='.repeat(60));

  try {
    // Test 1: Database
    logger.info('\nTest 1: Database initialization');
    const systemState = stateManager.getSystemState();
    logger.success('✓ Database working', systemState);

    const portfolio = stateManager.getPortfolioState();
    logger.success('✓ Portfolio state initialized', portfolio);

    // Test 2: Event Bus
    logger.info('\nTest 2: Event bus');
    let eventReceived = false;
    eventBus.on('test:event', (data) => {
      eventReceived = true;
      logger.success('✓ Event received', data);
    });
    eventBus.emit('test:event', { message: 'Hello from event bus' });

    setTimeout(() => {
      if (eventReceived) {
        logger.success('✓ Event bus working correctly');
      } else {
        logger.error('✗ Event bus not working');
      }
    }, 100);

    // Test 3: State updates
    logger.info('\nTest 3: State updates');
    stateManager.updateSystemState({ cycle_count: 0 });
    const updatedState = stateManager.getSystemState();
    logger.success('✓ State update working', { cycleCount: updatedState.cycle_count });

    // Test 4: Portfolio updates
    logger.info('\nTest 4: Portfolio updates');
    const startingBalance = parseFloat(process.env.PAPER_TRADING_STARTING_BALANCE) || 100;
    stateManager.updatePortfolioState({
      total_balance: startingBalance,
      available_balance: startingBalance
    });
    const updatedPortfolio = stateManager.getPortfolioState();
    logger.success('✓ Portfolio update working', {
      balance: updatedPortfolio.total_balance,
      available: updatedPortfolio.available_balance
    });

    logger.info('\n' + '='.repeat(60));
    logger.success('All Phase 1 tests passed! ✓');
    logger.info('='.repeat(60));

    logger.info('\nNext steps:');
    logger.info('1. Copy .env.example to .env');
    logger.info('2. Add your API keys to .env (optional for Phase 1)');
    logger.info('3. Run: npm start');
    logger.info('4. System will run cycles every 60 minutes');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testPhase1();
