/**
 * Quick test tanpa LLM - test logic fallback saja
 * Untuk memverifikasi struktur tanpa perlu API key
 */
require('dotenv').config();
const assert = require('assert');
const RiskAgent = require('./src/agents/decision/riskAgent');
const StrategyAgent = require('./src/agents/decision/strategyAgent');

async function quickTest() {
  console.log('========================================');
  console.log('Phase 4 Quick Test (Logic Fallback)');
  console.log('========================================\n');

  // Test 1: RiskAgent Logic
  console.log('1. Testing RiskAgent Logic...');
  const riskAgent = new RiskAgent();

  const mockPool = {
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
      confidence: 'high'
    },
    pool_validation: {
      isValid: true,
      active_bin_id: 25,
      total_bins: 50
    }
  };

  const riskResult = riskAgent.assessWithLogic(mockPool);

  assert(riskResult.decision === 'approved' || riskResult.decision === 'rejected');
  assert(typeof riskResult.risk_score === 'number');
  assert(Array.isArray(riskResult.risk_factors));
  assert(typeof riskResult.reasoning === 'string');

  console.log('✓ RiskAgent logic works');
  console.log(`  Decision: ${riskResult.decision}`);
  console.log(`  Risk Score: ${riskResult.risk_score}/10`);
  console.log(`  Reasoning: ${riskResult.reasoning}\n`);

  // Test 2: StrategyAgent Logic
  console.log('2. Testing StrategyAgent Logic...');
  const strategyAgent = new StrategyAgent();

  const strategyResult = strategyAgent.formulateWithLogic(mockPool);

  assert(strategyResult.entry_strategy);
  assert(strategyResult.exit_strategy);
  assert(strategyResult.dca_config);
  assert(typeof strategyResult.confidence === 'number');
  assert(typeof strategyResult.reasoning === 'string');

  console.log('✓ StrategyAgent logic works');
  console.log(`  Entry: ${strategyResult.entry_strategy.strategy_type}, bin_step ${strategyResult.entry_strategy.bin_step}`);
  console.log(`  Exit: SL ${(strategyResult.exit_strategy.stop_loss_percent * 100).toFixed(1)}%, TP ${(strategyResult.exit_strategy.take_profit_percent * 100).toFixed(1)}%`);
  console.log(`  DCA: ${strategyResult.dca_config.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`  Reasoning: ${strategyResult.reasoning}\n`);

  // Test 3: Edge Cases
  console.log('3. Testing Edge Cases...');

  // Low TVL pool (should be rejected)
  const lowTVLPool = {
    ...mockPool,
    pool_metrics: {
      ...mockPool.pool_metrics,
      tvl: 5000 // Below $10k
    }
  };

  const lowTVLResult = riskAgent.assessWithLogic(lowTVLPool);
  assert(lowTVLResult.decision === 'rejected', 'Low TVL should be rejected');
  console.log('✓ Low TVL pool correctly rejected');

  // No LPers data (should use volatility-based strategy)
  const noLPersPool = {
    ...mockPool,
    lper_insights: null
  };

  const noLPersResult = strategyAgent.formulateWithLogic(noLPersPool);
  assert(noLPersResult.confidence < strategyResult.confidence, 'No LPers should have lower confidence');
  console.log('✓ No LPers data handled correctly\n');

  console.log('========================================');
  console.log('All Quick Tests Passed! ✓');
  console.log('========================================');
  console.log('\nNext: Test with real LLM using test-phase4.js');
}

quickTest().catch(err => {
  console.error('Quick test failed:', err);
  process.exit(1);
});
