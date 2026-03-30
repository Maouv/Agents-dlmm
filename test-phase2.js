require('dotenv').config();
const logger = require('./src/utils/logger');
const dataAggregator = require('./src/data');

// Test Phase 2: Data Layer
async function testPhase2() {
  logger.info('='.repeat(60));
  logger.info('Testing Phase 2: Data Layer');
  logger.info('='.repeat(60));

  try {
    logger.info('\nTest: Data Aggregation (Meteora + Dexscreener + Solscan)');

    // Run data aggregation
    const result = await dataAggregator.aggregate();

    logger.info('\n' + '='.repeat(60));
    logger.success('Phase 2 Test Complete!');
    logger.info('='.repeat(60));

    logger.info('\nResults:');
    logger.info(`- Total pools fetched: ${result.stats.total_pools}`);
    logger.info(`- Pools after initial filter: ${result.stats.filtered_pools}`);
    logger.info(`- Rug Me candidates: ${result.stats.candidates}`);
    logger.info(`- Duration: ${result.stats.duration_ms}ms`);

    if (result.pools.length > 0) {
      logger.info('\nTop 3 candidates:');
      result.pools.slice(0, 3).forEach((pool, i) => {
        logger.info(`\n${i + 1}. ${pool.token_symbol}`);
        logger.info(`   - Pool: ${pool.pool_address}`);
        logger.info(`   - MC: $${pool.market_cap.toLocaleString()}`);
        logger.info(`   - Volume/min: $${pool.volume_per_minute.toFixed(2)}`);
        logger.info(`   - TVL: $${pool.tvl.toLocaleString()}`);
        logger.info(`   - Price: $${pool.price_usd}`);
        logger.info(`   - Fee: ${pool.base_fee}%`);
        if (pool.age_hours !== null) {
          logger.info(`   - Age: ${pool.age_hours.toFixed(1)}h (${pool.age_days.toFixed(1)}d)`);
        }
      });
    }

    logger.info('\n✓ Data layer working correctly');
    logger.info('✓ Ready for Phase 3: Analysis Agents');

    process.exit(0);

  } catch (error) {
    logger.error('Phase 2 test failed:', error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run test
testPhase2();
