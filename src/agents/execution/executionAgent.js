const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const paperTradingEngine = require('./paperTradingEngine');

class ExecutionAgent {
  constructor() {
    this.name = 'ExecutionAgent';
    this.model = 'gemini-2.5-flash';
    this.provider = 'google-ai-studio';
    this.temperature = 0.1; // Low temperature for precise execution

    logger.info(`${this.name} initialized`);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on('decision:ready', async (data) => {
      await this.execute(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  /**
   * Execute trade decisions
   */
  async execute(data) {
    try {
      logger.info(`${this.name}: Executing ${data.decisions.length} decisions`);

      if (!data.decisions || data.decisions.length === 0) {
        logger.warn(`${this.name}: No decisions to execute`);
        return;
      }

      const executions = [];

      for (const decision of data.decisions) {
        try {
          // Only execute ENTER decisions
          if (decision.decision !== 'ENTER') {
            logger.debug(`${this.name}: Skipping ${decision.token_symbol} - decision: ${decision.decision}`);
            continue;
          }

          const execution = await this.executeDecision(decision);
          if (execution) {
            executions.push(execution);
          }
        } catch (error) {
          logger.error(`${this.name}: Error executing ${decision.pool_address}`, error);
        }
      }

      logger.success(`${this.name}: Execution complete, ${executions.length} positions opened`);

      // Emit execution complete
      eventBus.emit('execution:complete', {
        executions,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`${this.name}: Execution failed`, error);
      eventBus.emit('agent:error', {
        agentName: this.name,
        error: error.message
      });
    }
  }

  /**
   * Execute single decision
   */
  async executeDecision(decision) {
    logger.info(`${this.name}: Opening position for ${decision.token_symbol}`);

    // Open paper trading position
    const position = paperTradingEngine.openPosition({
      pool_address: decision.pool_address,
      token_symbol: decision.token_symbol,
      strategy: decision.strategy,
      position_size: decision.position_size,
      risk_params: decision.risk_params,
      lper_insights: decision.lper_insights,
      pool_metrics: decision.pool_metrics,
      reasoning: decision.reasoning,
      confidence: decision.confidence
    });

    if (!position) {
      logger.error(`${this.name}: Failed to open position for ${decision.token_symbol}`);
      return null;
    }

    logger.success(`${this.name}: Position opened - ${position.id}`);
    logger.info(`${this.name}: Entry price: $${position.entry_price.toFixed(6)}`);
    logger.info(`${this.name}: Position size: $${position.position_size}`);
    logger.info(`${this.name}: Strategy: ${position.strategy.type}`);

    return {
      position_id: position.id,
      pool_address: decision.pool_address,
      token_symbol: decision.token_symbol,
      decision: decision.decision,
      position_size: position.position_size,
      entry_price: position.entry_price,
      strategy: decision.strategy,
      lper_insights: decision.lper_insights,
      pool_metrics: decision.pool_metrics,
      reasoning: decision.reasoning,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close position
   */
  async closePosition(positionId, reason) {
    logger.info(`${this.name}: Closing position ${positionId}`);

    const result = paperTradingEngine.closePosition(positionId, reason);

    if (!result) {
      logger.error(`${this.name}: Failed to close position ${positionId}`);
      return null;
    }

    logger.success(`${this.name}: Position closed - ${positionId}`);
    logger.info(`${this.name}: PnL: $${result.pnl_usd.toFixed(2)} (${result.pnl_percent.toFixed(2)}%)`);
    logger.info(`${this.name}: Hold time: ${result.hold_hours.toFixed(2)}h`);

    // Emit trade exit event for Memory Agent
    eventBus.emit('trade:exit', {
      pool_address: result.pool_address,
      exit_price: result.exit_price,
      pnl_usd: result.pnl_usd,
      pnl_percent: result.pnl_percent,
      hold_hours: result.hold_hours,
      exit_reason: reason
    });

    return result;
  }
}

module.exports = new ExecutionAgent();
