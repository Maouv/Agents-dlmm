require('dotenv').config();
const assert = require('assert');
const StrategyAgent = require('../../../src/agents/decision/strategyAgent');

async function testStrategyAgent() {
  console.log('Testing StrategyAgent...');

  const strategyAgent = new StrategyAgent();

  // Mock approved pool
  const mockApproved = {
    pool_address: 'test-pool-123',
    token_symbol: 'TEST',
    score: 7.5,
    pool_metrics: {
      tvl: 45000,
      volume_24h: 120000,
      market_cap: 850000,
      volatility: 1.65,
      fee_tvl_ratio: 0.15
    },
    lper_insights: {
      qualified_count: 3,
      avg_win_rate: 0.68,
      avg_roi: 0.12,
      preferred_strategy: 'bid_ask',
      preferred_bin_step: 100,
      avg_hold_hours: 3.5,
      confidence: 'high'
    },
    pool_validation: {
      isValid: true,
      active_bin_id: 25,
      total_bins: 50
    }
  };

  // Test strategy formulation
  const result = await strategyAgent.formulate(mockApproved);

  assert(result.entry_strategy, 'Entry strategy required');
  assert(result.entry_strategy.price_target, 'Price target required');
  assert(result.entry_strategy.bin_step, 'Bin step required');
  assert(result.entry_strategy.bin_range, 'Bin range required');
  assert(result.exit_strategy, 'Exit strategy required');
  assert(result.exit_strategy.stop_loss_percent >= 0, 'Stop loss required');
  assert(result.exit_strategy.take_profit_percent >= 0, 'Take profit required');
  assert(result.dca_config, 'DCA config required');
  assert(typeof result.confidence === 'number', 'Confidence must be number');
  assert(typeof result.reasoning === 'string', 'Reasoning required');

  console.log('✓ Strategy formulation works');
  console.log('Entry Strategy:', result.entry_strategy);
  console.log('Exit Strategy:', result.exit_strategy);
  console.log('DCA Config:', result.dca_config);
  console.log('Reasoning:', result.reasoning);

  console.log('All StrategyAgent tests passed!');
}

testStrategyAgent().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
