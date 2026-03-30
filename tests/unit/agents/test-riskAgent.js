require('dotenv').config();
const assert = require('assert');
const RiskAgent = require('../../../src/agents/decision/riskAgent');

async function testRiskAgent() {
  console.log('Testing RiskAgent...');

  const riskAgent = new RiskAgent();

  // Mock ScoutAgent recommendation
  const mockRec = {
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

  // Test risk assessment
  const result = await riskAgent.assess(mockRec);

  assert(result.decision === 'approved' || result.decision === 'rejected', 'Decision must be approved/rejected');
  assert(typeof result.risk_score === 'number', 'Risk score must be number');
  assert(Array.isArray(result.risk_factors), 'Risk factors must be array');
  assert(result.confidence >= 0 && result.confidence <= 1, 'Confidence must be 0-1');
  assert(typeof result.reasoning === 'string', 'Reasoning must be string');

  console.log('✓ Risk assessment works');
  console.log('Decision:', result.decision);
  console.log('Risk Score:', result.risk_score);
  console.log('Reasoning:', result.reasoning);

  console.log('All RiskAgent tests passed!');
}

testRiskAgent().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
