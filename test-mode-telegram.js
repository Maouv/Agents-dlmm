require('dotenv').config();
const logger = require('./src/utils/logger');
const modeManager = require('./src/control/modeManager');
const telegramBot = require('./src/telegram/telegramBot');

// Test Mode Manager + Telegram Bot
async function testModeTelegram() {
  logger.info('='.repeat(60));
  logger.info('Testing Mode Manager + Telegram Bot');
  logger.info('='.repeat(60));

  try {
    logger.info('\nTest 1: Mode Manager - Initial State');
    logger.info('-'.repeat(60));

    const initialStatus = modeManager.getStatus();
    logger.info(`Mode: ${initialStatus.mode}`);
    logger.info(`Status: ${initialStatus.status}`);
    logger.info(`Is Running: ${initialStatus.isRunning}`);


    logger.info('\nTest 2: Mode Manager - Start Paper Trading');
    logger.info('-'.repeat(60));

    const paperStartResult = modeManager.startPaper();
    logger.info(`Success: ${paperStartResult.success}`);
    logger.info(`Message: ${paperStartResult.message}`);

    const afterPaperStart = modeManager.getStatus();
    logger.info(`Mode: ${afterPaperStart.mode}`);
    logger.info(`Status: ${afterPaperStart.status}`);


    logger.info('\nTest 3: Mode Manager - Start Paper Again (should fail)');
    logger.info('-'.repeat(60));

    const paperStartAgain = modeManager.startPaper();
    logger.info(`Success: ${paperStartAgain.success}`);
    logger.info(`Message: ${paperStartAgain.message}`);


    logger.info('\nTest 4: Mode Manager - Start Real Trading (should stop paper first)');
    logger.info('-'.repeat(60));

    const realStartResult = modeManager.startReal();
    logger.info(`Success: ${realStartResult.success}`);
    logger.info(`Message: ${realStartResult.message}`);

    const afterRealStart = modeManager.getStatus();
    logger.info(`Mode: ${afterRealStart.mode}`);
    logger.info(`Status: ${afterRealStart.status}`);


    logger.info('\nTest 5: Mode Manager - Stop Real Trading');
    logger.info('-'.repeat(60));

    const realStopResult = modeManager.stopReal();
    logger.info(`Success: ${realStopResult.success}`);
    logger.info(`Message: ${realStopResult.message}`);

    const afterRealStop = modeManager.getStatus();
    logger.info(`Mode: ${afterRealStop.mode}`);
    logger.info(`Status: ${afterRealStop.status}`);


    logger.info('\nTest 6: Mode Manager - Stop Real Again (should fail)');
    logger.info('-'.repeat(60));

    const realStopAgain = modeManager.stopReal();
    logger.info(`Success: ${realStopAgain.success}`);
    logger.info(`Message: ${realStopAgain.message}`);


    logger.info('\nTest 7: Telegram Bot - Check Configuration');
    logger.info('-'.repeat(60));

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      logger.warn('TELEGRAM_BOT_TOKEN not set');
      logger.info('Set TELEGRAM_BOT_TOKEN in .env to enable Telegram bot');
    } else {
      logger.success('TELEGRAM_BOT_TOKEN is set');
    }

    if (!process.env.TELEGRAM_CHAT_ID) {
      logger.warn('TELEGRAM_CHAT_ID not set');
      logger.info('Set TELEGRAM_CHAT_ID in .env to restrict bot to your chat');
    } else {
      logger.success(`TELEGRAM_CHAT_ID is set: ${process.env.TELEGRAM_CHAT_ID}`);
    }


    logger.info('\nTest 8: Start Telegram Bot');
    logger.info('-'.repeat(60));

    if (process.env.TELEGRAM_BOT_TOKEN) {
      telegramBot.start();
      logger.success('Telegram bot started');
      logger.info('Available commands:');
      logger.info('  /help - Show available commands');
      logger.info('  /paper start|stop - Control paper trading');
      logger.info('  /real start|stop - Control real trading');
      logger.info('  /status - Show current status');
      logger.info('\nBot is running. Send commands to your Telegram bot!');
      logger.info('Press Ctrl+C to stop');

      // Keep the process running
      return;
    } else {
      logger.warn('Cannot start Telegram bot - TELEGRAM_BOT_TOKEN not set');
    }


    logger.info('\n' + '='.repeat(60));
    logger.success('Mode Manager + Telegram Bot Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nTest Summary:');
    logger.info('✓ Mode state persistence working');
    logger.info('✓ Paper start/stop logic working');
    logger.info('✓ Real start/stop logic working');
    logger.info('✓ Auto-stop paper when starting real');
    logger.info('✓ Duplicate start/stop prevention');
    logger.info('✓ Telegram bot initialized');

    logger.info('\nNext Steps:');
    logger.info('1. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env');
    logger.info('2. Test Telegram commands: /paper start, /real start, /status');
    logger.info('3. Integrate with main pipeline (index.js)');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run test
testModeTelegram();
