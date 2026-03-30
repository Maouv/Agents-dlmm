require('dotenv').config();
const logger = require('./src/utils/logger');
const dataAggregatorV2 = require('./src/data/aggregator-v2');
const ScoutAgent = require('./src/agents/analysis/scoutAgent');

// Test Phase 3: LP Agent IO + Enhanced Scout Agent
async function testPhase3() {
  logger.info('='.repeat(60));
  logger.info('Testing Phase 3: LP Agent IO + Scout Agent');
  logger.info('='.repeat(60));

  try {
    logger.info('\nTest 1: LP Agent IO Fetcher');
    logger.info('-'.repeat(60));

    const lpAgentFetcher = require('./src/data/lpAgentFetcher');

    // Test LP Agent API (will fail without API key, but shows structure)
    logger.info('LP Agent IO initialized');
    logger.info('Note: LP Agent IO requires API key. Test will show structure if no key provided.');


    logger.info('\nTest 2: DLMM SDK Wrapper');
    logger.info('-'.repeat(60));

    const dlmmSDK = require('./src/services/dlmmSDK');

    // Test validation
    const validation = await dlmmSDK.validatePool('test-pool-address');
    logger.info('Pool validation result:', validation);

    // Test bin calculation
    const binRange = dlmmSDK.calculateBinRange({
      activeBinId: 25,
      volatility: 1.65,
      strategy: 'bid_ask',
      binStep: 100
    });
    logger.info('Calculated bin range:', binRange);

    // Test position amounts
    const amounts = dlmmSDK.calculatePositionAmounts({
      totalAmount: 100,
      currentPrice: 0.85,
      binRange: binRange,
      strategy: 'bid_ask'
    });
    logger.info('Position amounts:', amounts);


    logger.info('\nTest 3: Enhanced Data Aggregation');
    logger.info('-'.repeat(60));

    // Run full aggregation
    const result = await dataAggregatorV2.aggregate();

    logger.info('\nAggregation Results:');
    logger.info(`- Total pools: ${result.stats.total_pools}`);
    logger.info(`- After initial filter: ${result.stats.filtered_pools}`);
    logger.info(`- Enriched with LPers: ${result.stats.enriched_pools}`);
    logger.info(`- Final candidates: ${result.stats.final_candidates}`);
    logger.info(`- Duration: ${result.stats.duration_ms}ms`);


    logger.info('\nTest 4: Scout Agent Analysis');
    logger.info('-'.repeat(60));

    // Initialize Scout Agent
    const scoutAgent = new ScoutAgent();

    // If we have candidates, analyze them
    if (result.pools.length > 0) {
      logger.info(`\nAnalyzing ${result.pools.length} candidate pools...`);

      // Scout agent will automatically analyze when 'data:ready' event is emitted
      // But we can also test directly:
      const testData = { pools: result.pools.slice(0, 3) };
      await scoutAgent.analyze(testData);

    } else {
      logger.warn('No candidates found to analyze. This is expected if:');
      logger.warn('1. No pools meet criteria');
      logger.warn('2. LP Agent IO API key not configured');
      logger.warn('3. Market conditions don\'t match filters');

      // Test with mock data
      logger.info('\nTesting Scout Agent with mock data...');
      const mockPool = {
        pool_address: 'test-pool-123',
        token_symbol: 'TEST',
        tvl: 45000,
        volume_24h: 120000,
        market_cap: 850000,
        volume_per_minute: 8000,
        volatility: 1.65,
        fee_tvl_ratio: 0.15,
        price_usd: 0.85,
        base_fee: 5,
        pool_validation: {
          isValid: true,
          active_bin_id: 25
        },
        lper_analysis: {
          qualified_count: 3,
          avg_win_rate: 0.68,
          avg_roi: 0.12,
          avg_hold_hours: 2.8,
          preferred_strategy: 'bid_ask',
          preferred_bin_step: 100,
          confidence: 'high'
        }
      };

      await scoutAgent.analyze({ pools: [mockPool] });
    }


    logger.info('\n' + '='.repeat(60));
    logger.success('Phase 3 Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nPhase 3 Status:');
    logger.info('✓ LP Agent IO fetcher created');
    logger.info('✓ DLMM SDK wrapper created');
    logger.info('✓ Enhanced data aggregator created');
    logger.info('✓ Scout Agent with LPers analysis created');
    logger.info('✓ Strategy recommendation logic implemented');

    logger.info('\nNext Steps:');
    logger.info('1. Add LP_AGENT_API_KEY to .env (if you have one)');
    logger.info('2. Test with real LP Agent IO data');
    logger.info('3. Proceed to Phase 4: Decision Agent + Memory Agent');

    process.exit(0);

  } catch (error) {
    logger.error('Phase 3 test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run test
testPhase3();
