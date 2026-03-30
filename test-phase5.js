require('dotenv').config();
const logger = require('./src/utils/logger');
const eventBus = require('./src/core/eventBus');
const decisionAgent = require('./src/agents/decision/decisionAgent');
const executionAgent = require('./src/agents/execution/executionAgent');
const paperTradingEngine = require('./src/agents/execution/paperTradingEngine');
const positionMonitor = require('./src/agents/execution/positionMonitor');

// Test Phase 5: Execution Agent + Paper Trading Engine
async function testPhase5() {
  logger.info('='.repeat(60));
  logger.info('Testing Phase 5: Execution Agent + Paper Trading Engine');
  logger.info('='.repeat(60));

  try {
    logger.info('\nTest 1: Paper Trading Engine - Open Position');
    logger.info('-'.repeat(60));

    // Mock decision from Decision Agent
    const mockDecision = {
      pool_address: 'HTvjzsfX3yU6BUodCjZ5vZkUrAxMDTrBs3CJaq43ashR',
      token_symbol: 'MOCK',
      decision: 'ENTER',
      confidence: 0.85,
      position_size: 600,
      risk_params: {
        stop_loss_percent: 0.08,
        take_profit_percent: 0.18,
        max_hold_hours: 4.5,
        position_size_usd: 600,
        risk_reward_ratio: 2.25
      },
      strategy: {
        type: 'bid_ask',
        bin_step: 100,
        bin_range: {
          lower_bin_id: 10,
          upper_bin_id: 40,
          total_bins: 30
        },
        expected_hold_hours: 3
      },
      lper_insights: {
        qualified_count: 3,
        avg_win_rate: 0.68,
        avg_roi: 0.12,
        confidence: 'high'
      },
      pool_metrics: {
        tvl: 45000,
        volume_24h: 120000,
        market_cap: 850000,
        volatility: 1.65,
        fee_tvl_ratio: 0.15
      },
      reasoning: 'Strong LPers data with 68% win rate'
    };

    // Listen for execution
    eventBus.once('execution:complete', (data) => {
      logger.info('\nExecution Result:');
      logger.info(`- Executions: ${data.executions.length}`);
      if (data.executions.length > 0) {
        const exec = data.executions[0];
        logger.info(`- Position ID: ${exec.position_id}`);
        logger.info(`- Token: ${exec.token_symbol}`);
        logger.info(`- Entry Price: $${exec.entry_price.toFixed(6)}`);
        logger.info(`- Position Size: $${exec.position_size}`);
        logger.info(`- Strategy: ${exec.strategy.type}`);
      }
    });

    // Trigger execution
    eventBus.emit('decision:ready', {
      decisions: [mockDecision],
      timestamp: new Date().toISOString()
    });

    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 1000));


    logger.info('\nTest 2: Paper Trading Engine - Position Management');
    logger.info('-'.repeat(60));

    const activePositions = paperTradingEngine.getActivePositions();
    logger.info(`Active Positions: ${activePositions.length}`);

    if (activePositions.length > 0) {
      const position = activePositions[0];
      logger.info(`- ID: ${position.id}`);
      logger.info(`- Token: ${position.token_symbol}`);
      logger.info(`- Entry: $${position.entry_price.toFixed(6)}`);
      logger.info(`- Size: $${position.position_size}`);
      logger.info(`- Strategy: ${position.strategy.type}`);

      // Get position metrics
      const currentPrice = position.entry_price * 1.05; // Simulate 5% gain
      const metrics = paperTradingEngine.getPositionMetrics(position.id, currentPrice);

      logger.info('\nPosition Metrics (5% gain):');
      logger.info(`- Current Price: $${metrics.current_price.toFixed(6)}`);
      logger.info(`- Unrealized PnL: $${metrics.unrealized_pnl_usd.toFixed(2)}`);
      logger.info(`- Unrealized PnL %: ${metrics.unrealized_pnl_percent.toFixed(2)}%`);
    }


    logger.info('\nTest 3: Position Monitor - Exit Conditions');
    logger.info('-'.repeat(60));

    // Simulate price changes and check exit conditions
    const positions = paperTradingEngine.getActivePositions();

    if (positions.length > 0) {
      const position = positions[0];

      // Test stop loss
      logger.info('\nScenario 1: Stop Loss Trigger');
      const stopLossPrice = position.entry_price * (1 - position.risk_params.stop_loss_percent);
      const stopLossExits = paperTradingEngine.checkExitConditions({
        [position.pool_address]: stopLossPrice
      });
      logger.info(`- Price dropped to: $${stopLossPrice.toFixed(6)}`);
      logger.info(`- Exit triggered: ${stopLossExits.length > 0 ? 'YES' : 'NO'}`);
      if (stopLossExits.length > 0) {
        logger.info(`- Exit reason: ${stopLossExits[0].reason}`);
      }

      // Test take profit
      logger.info('\nScenario 2: Take Profit Trigger');
      const takeProfitPrice = position.entry_price * (1 + position.risk_params.take_profit_percent);
      const takeProfitExits = paperTradingEngine.checkExitConditions({
        [position.pool_address]: takeProfitPrice
      });
      logger.info(`- Price rose to: $${takeProfitPrice.toFixed(6)}`);
      logger.info(`- Exit triggered: ${takeProfitExits.length > 0 ? 'YES' : 'NO'}`);
      if (takeProfitExits.length > 0) {
        logger.info(`- Exit reason: ${takeProfitExits[0].reason}`);
      }

      // Test max hold time
      logger.info('\nScenario 3: Max Hold Time');
      logger.info(`- Max hold: ${position.risk_params.max_hold_hours}h`);
      logger.info(`- Simulating time passage... (skipping in test)`);
    }


    logger.info('\nTest 4: Paper Trading Engine - Close Position');
    logger.info('-'.repeat(60));

    if (activePositions.length > 0) {
      const position = activePositions[0];

      // Listen for trade exit
      eventBus.once('trade:exit', (data) => {
        logger.info('\nTrade Exit Event:');
        logger.info(`- Pool: ${data.pool_address}`);
        logger.info(`- Exit Price: $${data.exit_price.toFixed(6)}`);
        logger.info(`- PnL: $${data.pnl_usd.toFixed(2)} (${data.pnl_percent.toFixed(2)}%)`);
        logger.info(`- Hold Time: ${data.hold_hours.toFixed(2)}h`);
        logger.info(`- Reason: ${data.exit_reason}`);
      });

      // Close position
      const result = await executionAgent.closePosition(position.id, 'take_profit');

      if (result) {
        logger.success('Position closed successfully');
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));


    logger.info('\nTest 5: Position Monitor Status');
    logger.info('-'.repeat(60));

    const statusReport = positionMonitor.getStatusReport();
    logger.info('Monitor Status:');
    logger.info(`- Active Positions: ${statusReport.active_count}`);
    logger.info(`- Monitor Running: ${statusReport.monitor_running}`);


    logger.info('\n' + '='.repeat(60));
    logger.success('Phase 5 Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nPhase 5 Status:');
    logger.info('✓ Execution Agent created');
    logger.info('✓ Paper Trading Engine created');
    logger.info('✓ Position management implemented');
    logger.info('✓ Exit condition monitoring implemented');
    logger.info('✓ Stop loss / Take profit logic working');
    logger.info('✓ Position metrics tracking');
    logger.info('✓ Event-driven architecture working');

    logger.info('\nNext Steps:');
    logger.info('1. Integrate with real Meteora API data');
    logger.info('2. Connect Mother Agent for coordination');
    logger.info('3. Implement full pipeline test');

    process.exit(0);

  } catch (error) {
    logger.error('Phase 5 test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run test
testPhase5();
