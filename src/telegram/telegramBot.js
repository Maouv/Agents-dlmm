const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const modeManager = require('../control/modeManager');

class TelegramBot {
  constructor() {
    this.name = 'TelegramBot';
    this.bot = null;
    this.chatId = process.env.TELEGRAM_CHAT_ID;

    // Anti-duplicate notifier
    this.lastNotification = {
      type: null,
      mode: null,
      status: null,
      message: null,
      timestamp: 0
    };
    this.notificationCooldownMs = 1500;

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      logger.warn(`${this.name}: TELEGRAM_BOT_TOKEN not set, bot will not start`);
      return;
    }

    if (!this.chatId) {
      logger.warn(`${this.name}: TELEGRAM_CHAT_ID not set, commands will be restricted`);
    }

    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.setupCommands();
    this.setupCallbacks();
    this.setupEventListeners();

    logger.info(`${this.name} initialized`);
  }

  /**
   * Setup bot commands
   */
  setupCommands() {
    // Menu command
    this.bot.command('menu', (ctx) => {
      if (!this.isAuthorized(ctx)) {
        return ctx.reply('Unauthorized');
      }

      return ctx.reply('DLMM Paper Trader Menu', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📝 Paper Start', callback_data: 'paper_start' },
              { text: '🛑 Paper Stop', callback_data: 'paper_stop' }
            ],
            [
              { text: '💰 Real Start', callback_data: 'real_start' },
              { text: '🛑 Real Stop', callback_data: 'real_stop' }
            ],
            [
              { text: '📡 Status', callback_data: 'status' }
            ],
            [
              { text: '📊 Active Positions', callback_data: 'positions' }
            ]
          ]
        }
      });
    });

    // Help command
    this.bot.command('help', (ctx) => {
      if (!this.isAuthorized(ctx)) {
        return ctx.reply('Unauthorized');
      }

      const helpText = `
🤖 **DLMM Paper Trader Commands**

**Paper Trading Mode:**
/paper start - Start paper trading
/paper stop - Stop paper trading

**Real Trading Mode:**
/real start - Start real trading (auto-stops paper if running)
/real stop - Stop real trading

**Status:**
/status - Show current mode and status

**Note:** Real trading requires SOL balance and proper configuration.
      `;
      return ctx.reply(helpText, { parse_mode: 'Markdown' });
    });

    // Paper trading commands
    this.bot.command('paper', (ctx) => {
      if (!this.isAuthorized(ctx)) {
        return ctx.reply('Unauthorized');
      }

      const args = ctx.message.text.split(' ').slice(1);
      const action = args[0]?.toLowerCase();

      if (action === 'start') {
        const result = modeManager.startPaper();
        if (result.success) {
          logger.info(`${this.name}: Paper trading started via Telegram`);
          return ctx.reply('✅ ' + result.message);
        } else {
          return ctx.reply('⚠️  ' + result.message);
        }
      } else if (action === 'stop') {
        const result = modeManager.stopPaper();
        if (result.success) {
          logger.info(`${this.name}: Paper trading stopped via Telegram`);
          return ctx.reply('✅ ' + result.message);
        } else {
          return ctx.reply('⚠️  ' + result.message);
        }
      } else {
        return ctx.reply('Usage: /paper start|stop');
      }
    });

    // Real trading commands
    this.bot.command('real', (ctx) => {
      if (!this.isAuthorized(ctx)) {
        return ctx.reply('Unauthorized');
      }

      const args = ctx.message.text.split(' ').slice(1);
      const action = args[0]?.toLowerCase();

      if (action === 'start') {
        const result = modeManager.startReal();
        if (result.success) {
          logger.info(`${this.name}: Real trading started via Telegram`);
          return ctx.reply('✅ ' + result.message + '\n\n⚠️  **WARNING:** Real trading mode is active. Real funds at risk!');
        } else {
          return ctx.reply('⚠️  ' + result.message);
        }
      } else if (action === 'stop') {
        const result = modeManager.stopReal();
        if (result.success) {
          logger.info(`${this.name}: Real trading stopped via Telegram`);
          return ctx.reply('✅ ' + result.message);
        } else {
          return ctx.reply('⚠️  ' + result.message);
        }
      } else {
        return ctx.reply('Usage: /real start|stop');
      }
    });

    // Status command
    this.bot.command('status', (ctx) => {
      if (!this.isAuthorized(ctx)) {
        return ctx.reply('Unauthorized');
      }

      const status = modeManager.getStatus();
      const statusEmoji = status.isRunning ? '🟢' : '🔴';
      const modeEmoji = status.mode === 'real' ? '💰' : status.mode === 'paper' ? '📝' : '❌';

      const statusText = `
${statusEmoji} **System Status**

**Mode:** ${modeEmoji} ${status.mode.toUpperCase()}
**Status:** ${status.status.toUpperCase()}
**Running:** ${status.isRunning ? 'Yes' : 'No'}
**Last Updated:** ${status.timestamp}
      `;
      return ctx.reply(statusText, { parse_mode: 'Markdown' });
    });

    logger.debug(`${this.name}: Commands registered`);
  }

  /**
   * Setup callback handlers for inline keyboard
   */
  setupCallbacks() {
    // Paper start
    this.bot.action('paper_start', (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      const result = modeManager.startPaper();
      ctx.answerCbQuery(result.message);
      return ctx.reply(`✅ ${result.message}`);
    });

    // Paper stop
    this.bot.action('paper_stop', (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      const result = modeManager.stopPaper();
      ctx.answerCbQuery(result.message);
      return ctx.reply(`✅ ${result.message}`);
    });

    // Real start
    this.bot.action('real_start', (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      const result = modeManager.startReal();
      ctx.answerCbQuery(result.message);
      return ctx.reply(`✅ ${result.message}\n\n⚠️ WARNING: Real trading mode is active. Real funds at risk!`);
    });

    // Real stop
    this.bot.action('real_stop', (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      const result = modeManager.stopReal();
      ctx.answerCbQuery(result.message);
      return ctx.reply(`✅ ${result.message}`);
    });

    // Status
    this.bot.action('status', (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      const status = modeManager.getStatus();
      const statusEmoji = status.isRunning ? '🟢' : '🔴';
      const modeEmoji = status.mode === 'real' ? '💰' : status.mode === 'paper' ? '📝' : '❌';

      const statusText = `${statusEmoji} System Status\n\nMode: ${modeEmoji} ${status.mode.toUpperCase()}\nStatus: ${status.status.toUpperCase()}\nRunning: ${status.isRunning ? 'Yes' : 'No'}`;

      return ctx.reply(statusText);
    });

    // Positions
    this.bot.action('positions', async (ctx) => {
      if (!this.isAuthorized(ctx)) return ctx.answerCbQuery('Unauthorized');

      try {
        const paperTradingEngine = require('../agents/execution/paperTradingEngine');
        const positions = paperTradingEngine.getActivePositions();

        if (positions.length === 0) {
          return ctx.reply('📊 No active positions');
        }

        let message = `📊 Active Positions (${positions.length})\n\n`;

        positions.forEach((pos, idx) => {
          const holdHours = ((Date.now() - new Date(pos.entry_timestamp)) / (1000 * 60 * 60)).toFixed(2);
          message += `${idx + 1}. ${pos.token_symbol || 'Unknown'}\n`;
          message += `   Entry: $${pos.entry_price?.toFixed(6) || 'N/A'}\n`;
          message += `   Size: $${pos.position_size || 0}\n`;
          message += `   Hold: ${holdHours}h\n`;
          message += `   Strategy: ${pos.strategy?.type || 'N/A'}\n\n`;
        });

        return ctx.reply(message);

      } catch (error) {
        logger.error('Error fetching positions', error);
        return ctx.reply('❌ Error fetching positions');
      }
    });

    logger.debug(`${this.name}: Callbacks registered`);
  }

  /**
   * Setup event listeners from mode manager
   */
  setupEventListeners() {
    const eventBus = require('../core/eventBus');

    eventBus.on('mode:start', (data) => {
      this.notifyOnce({
        type: 'mode:start',
        mode: data.mode,
        status: 'running',
        message: `🚀 ${data.mode.toUpperCase()} trading mode started`
      });
    });

    eventBus.on('mode:stop', (data) => {
      this.notifyOnce({
        type: 'mode:stop',
        mode: data.mode,
        status: 'stopped',
        message: `🛑 ${data.mode.toUpperCase()} trading mode stopped`
      });
    });

    eventBus.on('mode:warning', (data) => {
      this.notifyOnce({
        type: 'mode:warning',
        mode: null,
        status: null,
        message: `⚠️  ${data.message}`
      });
    });

    // Enhancement 1: Auto-report positions after cycle
    eventBus.on('cycle:complete', (data) => {
      this.sendCycleSummary(data);
    });

    // Enhancement 2: Notify new position opened
    eventBus.on('execution:complete', (data) => {
      this.sendPositionNotification(data);
    });

    // Enhancement 3: Alert position close
    eventBus.on('trade:exit', (data) => {
      this.sendExitNotification(data);
    });

    logger.debug(`${this.name}: Event listeners setup`);
  }

  /**
   * Send cycle summary with positions
   */
  sendCycleSummary(cycleData) {
    try {
      const paperTradingEngine = require('../agents/execution/paperTradingEngine');
      const positions = paperTradingEngine.getActivePositions();

      let message = `✅ Cycle Complete\n\n`;
      message += `Cycle ID: ${cycleData.cycleId || 'N/A'}\n`;
      message += `Active Positions: ${positions.length}\n`;

      if (positions.length > 0) {
        message += `\n📊 Positions:\n`;
        positions.slice(0, 3).forEach((pos, idx) => {
          const holdHours = ((Date.now() - new Date(pos.entry_timestamp)) / (1000 * 60 * 60)).toFixed(1);
          message += `${idx + 1}. ${pos.token_symbol || 'Unknown'} - Hold: ${holdHours}h\n`;
        });

        if (positions.length > 3) {
          message += `... and ${positions.length - 3} more\n`;
        }
      }

      this.sendMessage(message);

    } catch (error) {
      logger.error('Error sending cycle summary', error);
    }
  }

  /**
   * Send position opened notification
   */
  sendPositionNotification(executionData) {
    try {
      if (!executionData.executions || executionData.executions.length === 0) {
        return;
      }

      executionData.executions.forEach((exec) => {
        let message = `🆕 New Position Opened\n\n`;
        message += `Token: ${exec.token_symbol || 'Unknown'}\n`;
        message += `Entry: $${exec.entry_price?.toFixed(6) || 'N/A'}\n`;
        message += `Size: $${exec.position_size || 0}\n`;
        message += `Strategy: ${exec.strategy?.type || 'N/A'}\n`;
        message += `Position ID: ${exec.position_id}\n`;

        this.sendMessage(message);
      });

    } catch (error) {
      logger.error('Error sending position notification', error);
    }
  }

  /**
   * Send position closed notification
   */
  sendExitNotification(exitData) {
    try {
      let message = `📤 Position Closed\n\n`;
      message += `Token: ${exitData.pool_address?.slice(0, 8) || 'Unknown'}\n`;
      message += `Exit Price: $${exitData.exit_price?.toFixed(6) || 'N/A'}\n`;
      message += `PnL: $${exitData.pnl_usd?.toFixed(2) || 0} (${exitData.pnl_percent?.toFixed(2) || 0}%)\n`;
      message += `Hold Time: ${exitData.hold_hours?.toFixed(2) || 0}h\n`;
      message += `Reason: ${exitData.exit_reason || 'N/A'}\n`;

      this.sendMessage(message);

    } catch (error) {
      logger.error('Error sending exit notification', error);
    }
  }

  /**
   * Check if user is authorized
   */
  isAuthorized(ctx) {
    if (!this.chatId) {
      logger.warn(`${this.name}: No chat ID configured, allowing all requests`);
      return true;
    }

    const userChatId = ctx.chat?.id?.toString();
    return userChatId === this.chatId;
  }

  notifyOnce({ type, mode, status, message }) {
    const now = Date.now();

    const same =
      this.lastNotification.type === type &&
      this.lastNotification.mode === mode &&
      this.lastNotification.status === status &&
      this.lastNotification.message === message;

    if (same && now - this.lastNotification.timestamp < this.notificationCooldownMs) {
      logger.debug(`${this.name}: Skipping duplicate telegram notification`);
      return;
    }

    this.lastNotification = { type, mode, status, message, timestamp: now };
    this.sendMessage(message);
  }

  /**
   * Send message to configured chat
   */
  sendMessage(message) {
    if (!this.bot || !this.chatId) {
      logger.debug(`${this.name}: Bot not configured, skipping message`);
      return;
    }

    try {
      this.bot.telegram.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      const code = error?.response?.error_code;
      const description = error?.response?.description;
      if (code === 400 && String(description || '').includes('chat not found')) {
        logger.warn(`${this.name}: chat not found for chatId=${this.chatId}. Continuing.`);
        return;
      }
      logger.error(`${this.name}: Error sending message`, {
        message: error.message,
        code: error?.response?.error_code,
        description: error?.response?.description,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
    }
  }

  /**
   * Start the bot
   */
  start() {
    if (!this.bot) {
      logger.warn(`${this.name}: Bot not initialized, cannot start`);
      return;
    }

    try {
      this.bot.launch();
      logger.success(`${this.name}: Bot started successfully`);

      process.once('SIGINT', () => this.stop());
      process.once('SIGTERM', () => this.stop());

    } catch (error) {
      logger.error(`${this.name}: Failed to start bot`, error);
    }
  }

  /**
   * Stop the bot
   */
  stop() {
    if (this.bot) {
      this.bot.stop();
      logger.info(`${this.name}: Bot stopped`);
    }
  }
}

module.exports = new TelegramBot();

