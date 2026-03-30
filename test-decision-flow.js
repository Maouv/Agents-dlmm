require('dotenv').config();
const logger = require('./src/utils/logger');
const eventBus = require('./src/core/eventBus');

// Import orchestrator (will setup listener)
const decisionOrchestrator = require('./src/agents/decision/decisionOrchestrator');

console.log('Orchestrator loaded, listener should be ready');

// Check if listener is registered
console.log('EventBus listeners for scout:complete:', eventBus.listenerCount('scout:complete'));

// Manual trigger
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
  reasoning: 'Test'
};

// Set up listener for decision:ready
eventBus.once('decision:ready', (data) => {
  console.log('\n✓ DECISION READY EVENT RECEIVED!');
  console.log('Decisions count:', data.decisions.length);
  if (data.decisions.length > 0) {
    console.log('First decision:', data.decisions[0].decision);
  }
  process.exit(0);
});

// Set up error listener
eventBus.once('agent:error', (data) => {
  console.error('✗ AGENT ERROR:', data);
  process.exit(1);
});

console.log('\nEmitting scout:complete event...');
eventBus.emit('scout:complete', {
  recommendations: [mockRec],
  timestamp: new Date().toISOString()
});

console.log('Event emitted, waiting for decision:ready...');
console.log('(This should take 60-120 seconds with GLM-5)\n');

// Timeout after 3 minutes
setTimeout(() => {
  console.error('✗ Timeout - no decision received after 3 minutes');
  process.exit(1);
}, 180000);
