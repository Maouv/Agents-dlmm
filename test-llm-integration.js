require('dotenv').config();
const logger = require('./src/utils/logger');
const ScoutAgent = require('./src/agents/analysis/scoutAgent');

async function testLLMIntegration() {
  logger.info('='.repeat(60));
  logger.info('Testing ScoutAgent LLM Integration');
  logger.info('='.repeat(60));

  try {
    const scoutAgent = new ScoutAgent();

    // Test with mock pool data
    const mockPool = {
      token_symbol: 'SOL',
      pool_address: 'test-pool-sol-123',
      tvl: 50000,
      volume_24h: 120000,
      volatility: 1.65,
      market_cap: 850000,
      fee_tvl_ratio: 0.15,
      pool_validation: {
        active_bin_id: 50,
        total_bins: 100,
        liquidity_distribution: 'concentrated'
      },
      lper_analysis: {
        qualified_count: 3,
        avg_win_rate: 0.68,
        avg_roi: 0.12,
        preferred_strategy: 'bid_ask',
        preferred_bin_step: 100,
        avg_hold_hours: 3.5,
        confidence: 'high'
      }
    };

    logger.info('\nTest: Analyzing pool with LLM...');
    const recommendation = await scoutAgent.analyzePool(mockPool);

    logger.info('\n' + '='.repeat(60));
    logger.success('LLM Integration Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nRecommendation:');
    logger.info(`- Token: ${recommendation.token_symbol}`);
    logger.info(`- Score: ${recommendation.score}`);
    logger.info(`- Strategy: ${recommendation.strategy.type}`);
    logger.info(`- Bin Step: ${recommendation.strategy.bin_step}`);
    logger.info(`- Reasoning: ${recommendation.reasoning}`);
    logger.info(`- Confidence: ${recommendation.confidence}`);
    logger.info(`- Recommendation: ${recommendation.recommendation}`);

    if (recommendation.risk_factors && recommendation.risk_factors.length > 0) {
      logger.info(`- Risk Factors: ${recommendation.risk_factors.join(', ')}`);
    }

    logger.success('\n✅ LLM integration working!');

  } catch (error) {
    logger.error('LLM integration test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testLLMIntegration();
