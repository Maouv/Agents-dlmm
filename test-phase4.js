require('dotenv').config();
const logger = require('./src/utils/logger');
const eventBus = require('./src/core/eventBus');
const decisionAgent = require('./src/agents/decision/decisionAgent');
const memoryAgent = require('./src/agents/memory/memoryAgent');

// Test Phase 4: Decision Agent + Memory Agent
async function testPhase4() {
  logger.info('='.repeat(60));
  logger.info('Testing Phase 4: Decision Agent + Memory Agent');
  logger.info('='.repeat(60));

  try {
    logger.info('\nTest 1: Decision Agent - Risk Evaluation');
    logger.info('-'.repeat(60));

    // Mock scout recommendation
    const mockRecommendation = {
      pool_address: 'test-pool-123',
      token_symbol: 'TEST',
      score: 7.5,
      recommendation: 'ENTER',
      strategy: {
        type: 'bid_ask',
        bin_step: 100,
        bin_range: { lower_bin_id: 10, upper_bin_id: 40 },
        expected_hold_hours: 3
      },
      lper_insights: {
        qualified_count: 3,
        avg_win_rate: 0.68,
        avg_roi: 0.12,
        preferred_strategy: 'bid_ask',
        preferred_bin_step: 100,
        confidence: 'high'
      },
      pool_metrics: {
        tvl: 45000,
        volume_24h: 120000,
        market_cap: 850000,
        volatility: 1.65,
        fee_tvl_ratio: 0.15
      },
      pool_validation: { isValid: true },
      reasoning: 'Strong LPers data with 68% win rate'
    };

    // Listen for decision
    eventBus.once('decision:ready', (data) => {
      logger.info('\nDecision Result:');
      logger.info(`- Decision: ${data.decisions[0].decision}`);
      logger.info(`- Confidence: ${(data.decisions[0].confidence * 100).toFixed(1)}%`);
      logger.info(`- Position Size: $${data.decisions[0].position_size}`);
      logger.info(`- Risk-Adjusted Score: ${data.decisions[0].risk_adjusted_score.toFixed(2)}`);
      logger.info(`- Stop Loss: ${(data.decisions[0].risk_params.stop_loss_percent * 100).toFixed(1)}%`);
      logger.info(`- Take Profit: ${(data.decisions[0].risk_params.take_profit_percent * 100).toFixed(1)}%`);
      logger.info(`- Max Hold: ${data.decisions[0].risk_params.max_hold_hours.toFixed(1)}h`);
      logger.info(`- Risk/Reward: ${data.decisions[0].risk_params.risk_reward_ratio.toFixed(2)}`);
    });

    // Trigger decision
    eventBus.emit('scout:complete', {
      recommendations: [mockRecommendation],
      timestamp: new Date().toISOString()
    });

    // Wait for decision to complete
    await new Promise(resolve => setTimeout(resolve, 1000));


    logger.info('\nTest 2: Memory Agent - Trade Recording');
    logger.info('-'.repeat(60));

    // Mock execution data
    const mockExecution = {
      pool_address: 'test-pool-123',
      token_symbol: 'TEST',
      decision: 'ENTER',
      position_size: 600,
      entry_price: 0.85,
      strategy: {
        type: 'bid_ask',
        bin_step: 100
      },
      lper_insights: {
        confidence: 'high',
        avg_win_rate: 0.68
      },
      pool_metrics: {
        tvl: 45000,
        volume_24h: 120000,
        volatility: 1.65
      },
      reasoning: 'Strong LPers data'
    };

    // Record trade
    const tradeId = await memoryAgent.recordTrade(mockExecution);
    logger.success(`Trade recorded with ID: ${tradeId}`);


    logger.info('\nTest 3: Memory Agent - Trade Exit & Lessons');
    logger.info('-'.repeat(60));

    // Mock exit data
    const mockExit = {
      pool_address: 'test-pool-123',
      exit_price: 0.92,
      pnl_usd: 49.41,
      pnl_percent: 8.24,
      hold_hours: 2.5,
      exit_reason: 'Take profit hit'
    };

    // Listen for lessons
    eventBus.once('memory:lessons', (data) => {
      logger.info('\nLessons Extracted:');
      data.lessons.forEach((lesson, i) => {
        logger.info(`${i + 1}. [${lesson.type}] ${lesson.condition}`);
        logger.info(`   → ${lesson.outcome}`);
        logger.info(`   → ${lesson.context}`);
      });
    });

    // Record exit
    await memoryAgent.updateTradeExit(mockExit);
    logger.success('Trade exit recorded');


    logger.info('\nTest 4: Memory Agent - Performance Stats');
    logger.info('-'.repeat(60));

    const stats = memoryAgent.getPerformanceStats();
    logger.info('Performance Statistics:');
    logger.info(`- Total Trades: ${stats.total_trades}`);
    logger.info(`- Winning Trades: ${stats.winning_trades}`);
    logger.info(`- Losing Trades: ${stats.losing_trades}`);
    logger.info(`- Win Rate: ${(stats.win_rate * 100).toFixed(1)}%`);
    logger.info(`- Avg PnL: ${stats.avg_pnl_percent.toFixed(2)}%`);
    logger.info(`- Avg Hold Time: ${stats.avg_hold_hours.toFixed(1)}h`);
    logger.info(`- Avg Win: ${stats.avg_win.toFixed(2)}%`);
    logger.info(`- Avg Loss: ${stats.avg_loss.toFixed(2)}%`);


    logger.info('\nTest 5: Pattern Library');
    logger.info('-'.repeat(60));

    // Get patterns
    const patterns = memoryAgent.getRelevantPools('LPers');
    logger.info(`Found ${patterns.length} relevant patterns`);

    if (patterns.length > 0) {
      patterns.forEach(p => {
        logger.info(`- [${p.pattern_type}] ${p.condition} → ${p.outcome}`);
        logger.info(`  Success Rate: ${(p.success_rate * 100).toFixed(1)}%, Samples: ${p.sample_size}`);
      });
    }


    logger.info('\n' + '='.repeat(60));
    logger.success('Phase 4 Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nPhase 4 Status:');
    logger.info('✓ Decision Agent created with risk evaluation');
    logger.info('✓ Memory Agent created with trade journal');
    logger.info('✓ Position sizing logic implemented');
    logger.info('✓ Risk parameters calculation implemented');
    logger.info('✓ Pattern extraction logic implemented');
    logger.info('✓ Structured lessons format (FAILED/PREFER)');

    logger.info('\nNext Steps:');
    logger.info('1. Test with real LP Agent IO data');
    logger.info('2. Proceed to Phase 5: Execution Agent + Paper Trading Engine');

    process.exit(0);

  } catch (error) {
    logger.error('Phase 4 test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run test
testPhase4();
