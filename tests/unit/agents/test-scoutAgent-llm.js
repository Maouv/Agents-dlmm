require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const ScoutAgent = require('../../../src/agents/analysis/scoutAgent');

let scoutAgent;

test.before(() => {
  scoutAgent = new ScoutAgent();
});

test('ScoutAgent should initialize with LLM client', () => {
  assert.ok(scoutAgent.llmClient);
  assert.strictEqual(scoutAgent.model, 'moonshotai/kimi-k2-instruct');
});

test('ScoutAgent should build valid analysis prompt', () => {
  const mockPool = {
    token_symbol: 'TEST',
    pool_address: 'test-pool-123',
    tvl: 50000,
    volume_24h: 100000,
    volatility: 1.5,
    lper_analysis: {
      qualified_count: 3,
      avg_win_rate: 0.68,
      avg_roi: 0.12,
      preferred_strategy: 'bid_ask',
      preferred_bin_step: 100
    }
  };

  const { systemPrompt, userPrompt } = scoutAgent.buildAnalysisPrompt(mockPool);

  assert.ok(systemPrompt.includes('DLMM'));
  assert.ok(userPrompt.includes('TEST'));
  assert.ok(userPrompt.includes('LPERS DATA'));
});

test('ScoutAgent should analyze pool with LLM or fallback', async (t) => {
  if (!process.env.ZAI_API_KEY) {
    t.skip('ZAI_API_KEY not set');
    return;
  }

  const mockPool = {
    token_symbol: 'TEST',
    pool_address: 'test-pool-123',
    tvl: 50000,
    volume_24h: 100000,
    volatility: 1.5,
    market_cap: 500000,
    fee_tvl_ratio: 0.15,
    pool_validation: {
      active_bin_id: 50,
      total_bins: 100
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

  const recommendation = await scoutAgent.analyzePool(mockPool);

  assert.ok(recommendation.score >= 0 && recommendation.score <= 10);
  assert.ok(['bid_ask', 'spot', 'curve'].includes(recommendation.strategy.type));
  assert.ok(recommendation.reasoning);
  assert.ok(recommendation.recommendation);
});
