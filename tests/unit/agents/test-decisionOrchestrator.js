require('dotenv').config();
const assert = require('assert');
const eventBus = require('../../../src/core/eventBus');
const DecisionOrchestrator = require('../../../src/agents/decision/decisionOrchestrator');

async function testDecisionOrchestrator() {
  console.log('Testing DecisionOrchestrator...');

  // Mock ScoutAgent recommendation
  const mockRec = {
    pool_address: 'test-pool-123',
    token_symbol: 'TEST',
    score: 7.5,
    confidence: 'high',
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
    },
    reasoning: 'Strong LPers data'
  };

  // Listen for decision
  eventBus.once('decision:ready', (data) => {
    console.log('Decision received:');
    assert(data.decisions.length > 0, 'Should have decisions');
    const decision = data.decisions[0];

    assert(decision.decision === 'ENTER', 'Should be ENTER');
    assert(decision.position_size >= 100, 'Position size should be >= 100');
    assert(decision.entry_strategy, 'Entry strategy required');
    assert(decision.exit_strategy, 'Exit strategy required');
    assert(decision.dca_config, 'DCA config required');
    assert(decision.confidence >= 0 && decision.confidence <= 1, 'Confidence 0-1');

    console.log('✓ Decision:', decision.decision);
    console.log('✓ Position Size:', decision.position_size);
    console.log('✓ Confidence:', decision.confidence.toFixed(2));
    console.log('✓ Risk-Adjusted Score:', decision.risk_adjusted_score.toFixed(2));
    console.log('✓ Entry Strategy:', decision.entry_strategy);
    console.log('✓ Exit Strategy:', decision.exit_strategy);
    console.log('✓ DCA Config:', decision.dca_config);

    console.log('All DecisionOrchestrator tests passed!');
    process.exit(0);
  });

  // Trigger pipeline
  eventBus.emit('scout:complete', {
    recommendations: [mockRec],
    timestamp: new Date().toISOString()
  });

  // Wait for result
  await new Promise(resolve => setTimeout(resolve, 120000));
}

testDecisionOrchestrator().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
