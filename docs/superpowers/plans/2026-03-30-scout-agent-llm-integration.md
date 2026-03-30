# ScoutAgent LLM Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate GLM-4.7 Flash LLM into ScoutAgent for intelligent pool analysis while maintaining logic-based fallback and preserving existing data inputs/outputs.

**Architecture:**
- Create LLM provider abstraction layer (Z.ai client)
- Redesign ScoutAgent to use LLM with structured prompts
- Maintain logic-based fallback for API failures/cost savings
- Preserve existing scoring criteria and JSON output format

**Tech Stack:** Node.js, Z.ai API (GLM-4.7 Flash), existing eventBus architecture

---

## File Structure

**Create:**
- `src/providers/zaiClient.js` - Z.ai API client wrapper
- `src/providers/llmProvider.js` - Generic LLM provider interface
- `tests/unit/providers/test-zaiClient.js` - Provider tests
- `tests/unit/agents/test-scoutAgent-llm.js` - ScoutAgent LLM tests

**Modify:**
- `src/agents/analysis/scoutAgent.js` - Add LLM integration
- `package.json` - Add axios dependency
- `.env.example` - Add ZAI_API_KEY

---

## Task 1: Create LLM Provider Infrastructure

**Files:**
- Create: `src/providers/llmProvider.js`
- Create: `src/providers/zaiClient.js`

- [ ] **Step 1: Install axios dependency**

```bash
npm install axios
```

- [ ] **Step 2: Create generic LLM provider interface**

```javascript
// src/providers/llmProvider.js
const logger = require('../utils/logger');

/**
 * Generic LLM Provider Interface
 * All providers must implement this interface
 */
class LLMProvider {
  constructor(config) {
    this.model = config.model;
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 2000;
  }

  /**
   * Generate completion - must be implemented by subclasses
   * @param {string} systemPrompt - System context
   * @param {string} userPrompt - User query
   * @returns {Promise<string>} - Generated text
   */
  async generate(systemPrompt, userPrompt) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Generate structured JSON output
   * @param {string} systemPrompt - System context
   * @param {string} userPrompt - User query
   * @returns {Promise<object>} - Parsed JSON object
   */
  async generateJSON(systemPrompt, userPrompt) {
    const response = await this.generate(systemPrompt, userPrompt);

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\n?([\s\S]+?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Failed to parse LLM JSON response', { response, error });
      throw new Error(`Invalid JSON from LLM: ${error.message}`);
    }
  }
}

module.exports = LLMProvider;
```

- [ ] **Step 3: Create Z.ai client implementation**

```javascript
// src/providers/zaiClient.js
const axios = require('axios');
const LLMProvider = require('./llmProvider');
const logger = require('../utils/logger');

class ZaiClient extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.ZAI_API_KEY;
    this.baseURL = config.baseURL || 'https://api.zukijourney.com/v1';

    if (!this.apiKey) {
      logger.warn('ZAI_API_KEY not set - LLM features will fail');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async generate(systemPrompt, userPrompt) {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });

      const content = response.data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from Z.ai');
      }

      logger.debug('Z.ai response received', { model: this.model, tokens: response.data.usage });

      return content;

    } catch (error) {
      logger.error('Z.ai API error', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
}

module.exports = ZaiClient;
```

- [ ] **Step 4: Update .env.example**

Add to `.env.example`:
```
# Z.ai API (for GLM models)
ZAI_API_KEY=your_zai_api_key_here
```

- [ ] **Step 5: Commit provider infrastructure**

```bash
git add src/providers/ .env.example package.json
git commit -m "feat: add LLM provider infrastructure with Z.ai client"
```

---

## Task 2: Redesign ScoutAgent with LLM Integration

**Files:**
- Modify: `src/agents/analysis/scoutAgent.js`

- [ ] **Step 1: Add LLM provider to ScoutAgent constructor**

```javascript
// In src/agents/analysis/scoutAgent.js
const ZaiClient = require('../../providers/zaiClient');

class ScoutAgent {
  constructor() {
    this.name = 'ScoutAgent';
    this.model = 'glm-4-flash'; // GLM-4.7 Flash
    this.provider = 'zai';
    this.temperature = 0.3;

    // Initialize LLM client
    this.llmClient = new ZaiClient({
      model: this.model,
      temperature: this.temperature,
      maxTokens: 1500
    });

    logger.info(`${this.name} initialized with LLM: ${this.model}`);
    this.setupListeners();
  }

  // ... rest of code
}
```

- [ ] **Step 2: Create LLM prompt builder method**

Add to ScoutAgent class:

```javascript
/**
 * Build LLM prompt for pool analysis
 */
buildAnalysisPrompt(pool) {
  const hasLpersData = pool.lper_analysis && pool.lper_analysis.qualified_count > 0;

  const systemPrompt = `You are a professional DLMM (Dynamic Liquidity Market Maker) pool analyst.

Your role: Analyze pools and recommend trading strategies based on top LPers behavior and market conditions.

DATA AVAILABLE:
- Pool metrics: TVL, volume, volatility, market cap
- Top LPers data: win rate, ROI, strategy patterns, hold time
- Pool validation: active bin, liquidity distribution

SCORING CRITERIA:
- Score 7-10: ENTER (high confidence trade)
- Score 5-6.9: CONSIDER (moderate confidence)
- Score < 5: SKIP (low confidence)

STRATEGY TYPES:
- bid_ask: Concentrated liquidity around current price (low volatility)
- spot: Single-sided liquidity (medium volatility)
- curve: Wide spread liquidity (high volatility)

IMPORTANT:
1. PRIORITIZE LPers data over price trends when available
2. Mirror successful LPers strategies
3. Consider risk factors (TVL, volatility, market cap)
4. Provide clear reasoning for recommendations

OUTPUT: Return ONLY valid JSON, no markdown formatting.`;

  const userPrompt = `Analyze this DLMM pool and recommend a trading strategy:

POOL DATA:
- Symbol: ${pool.token_symbol}
- Pool Address: ${pool.pool_address}
- TVL: $${pool.tvl?.toLocaleString() || 'N/A'}
- 24h Volume: $${pool.volume_24h?.toLocaleString() || 'N/A'}
- Market Cap: $${pool.market_cap?.toLocaleString() || 'N/A'}
- Volatility: ${pool.volatility?.toFixed(2) || 'N/A'}
- Fee/TVL Ratio: ${pool.fee_tvl_ratio?.toFixed(3) || 'N/A'}

${hasLpersData ? `
TOP LPERS DATA:
- Qualified LPers: ${pool.lper_analysis.qualified_count}
- Avg Win Rate: ${(pool.lper_analysis.avg_win_rate * 100).toFixed(1)}%
- Avg ROI: ${(pool.lper_analysis.avg_roi * 100).toFixed(1)}%
- Preferred Strategy: ${pool.lper_analysis.preferred_strategy}
- Preferred Bin Step: ${pool.lper_analysis.preferred_bin_step}
- Avg Hold Time: ${pool.lper_analysis.avg_hold_hours?.toFixed(1)}h
- Confidence: ${pool.lper_analysis.confidence}
` : 'NO LPERS DATA AVAILABLE - Use price action analysis'}

POOL VALIDATION:
- Active Bin: ${pool.pool_validation?.active_bin_id || 'N/A'}
- Total Bins: ${pool.pool_validation?.total_bins || 'N/A'}
- Liquidity Distribution: ${pool.pool_validation?.liquidity_distribution || 'N/A'}

Return JSON with this exact structure:
{
  "score": <number 0-10>,
  "strategy_type": "<bid_ask|spot|curve>",
  "bin_step": <number>,
  "reasoning": "<string explaining recommendation>",
  "risk_factors": ["<array of risk concerns>"],
  "confidence": "<high|medium|low>"
}`;

  return { systemPrompt, userPrompt };
}
```

- [ ] **Step 3: Create LLM-based analysis method**

Add to ScoutAgent class:

```javascript
/**
 * Analyze pool using LLM
 */
async analyzeWithLLM(pool) {
  try {
    const { systemPrompt, userPrompt } = this.buildAnalysisPrompt(pool);

    const analysis = await this.llmClient.generateJSON(systemPrompt, userPrompt);

    // Validate LLM response
    if (typeof analysis.score !== 'number' || analysis.score < 0 || analysis.score > 10) {
      throw new Error('Invalid score from LLM');
    }

    if (!['bid_ask', 'spot', 'curve'].includes(analysis.strategy_type)) {
      throw new Error('Invalid strategy type from LLM');
    }

    logger.debug(`${this.name}: LLM analysis complete for ${pool.token_symbol}`, analysis);

    return analysis;

  } catch (error) {
    logger.error(`${this.name}: LLM analysis failed`, error);
    throw error;
  }
}
```

- [ ] **Step 4: Update analyzePool to use LLM with fallback**

Replace the `analyzePool` method:

```javascript
/**
 * Analyze individual pool
 * Returns recommendation with strategy and reasoning
 */
async analyzePool(pool) {
  logger.info(`${this.name}: Analyzing pool ${pool.token_symbol}`);

  const hasLpersData = pool.lper_analysis && pool.lper_analysis.qualified_count > 0;

  let strategy, reasoning, score, riskFactors = [], confidence = 'medium';

  // Try LLM analysis first
  try {
    const llmAnalysis = await this.analyzeWithLLM(pool);

    score = llmAnalysis.score;
    strategy = {
      type: llmAnalysis.strategy_type,
      bin_step: llmAnalysis.bin_step
    };
    reasoning = llmAnalysis.reasoning;
    riskFactors = llmAnalysis.risk_factors || [];
    confidence = llmAnalysis.confidence || 'medium';

    logger.info(`${this.name}: Used LLM analysis for ${pool.token_symbol}`);

  } catch (llmError) {
    // Fallback to logic-based analysis
    logger.warn(`${this.name}: LLM failed, using logic fallback for ${pool.token_symbol}`, llmError.message);

    if (hasLpersData) {
      const result = this.recommendFromLpers(pool);
      strategy = result.strategy;
      reasoning = result.reasoning;
      score = result.score;
    } else {
      const result = this.recommendFromPriceAction(pool);
      strategy = result.strategy;
      reasoning = result.reasoning;
      score = result.score;
    }
  }

  // Calculate position parameters
  const binRange = dlmmSDK.calculateBinRange({
    activeBinId: pool.pool_validation?.active_bin_id || 25,
    volatility: pool.volatility,
    strategy: strategy.type,
    binStep: strategy.bin_step
  });

  const expectedHoldHours = hasLpersData ?
    pool.lper_analysis.avg_hold_hours :
    this.estimateHoldTime(pool.volatility);

  return {
    pool_address: pool.pool_address,
    token_symbol: pool.token_symbol,
    score: score,
    strategy: {
      type: strategy.type,
      bin_step: strategy.bin_step,
      bin_range: binRange,
      expected_hold_hours: expectedHoldHours
    },
    lper_insights: hasLpersData ? {
      qualified_count: pool.lper_analysis.qualified_count,
      avg_win_rate: pool.lper_analysis.avg_win_rate,
      avg_roi: pool.lper_analysis.avg_roi,
      preferred_strategy: pool.lper_analysis.preferred_strategy,
      preferred_bin_step: pool.lper_analysis.preferred_bin_step,
      confidence: pool.lper_analysis.confidence
    } : null,
    pool_metrics: {
      tvl: pool.tvl,
      volume_24h: pool.volume_24h,
      market_cap: pool.market_cap,
      volatility: pool.volatility,
      fee_tvl_ratio: pool.fee_tvl_ratio
    },
    reasoning: reasoning,
    risk_factors: riskFactors,
    confidence: confidence,
    recommendation: score >= 7 ? 'ENTER' : score >= 5 ? 'CONSIDER' : 'SKIP'
  };
}
```

- [ ] **Step 5: Commit ScoutAgent LLM integration**

```bash
git add src/agents/analysis/scoutAgent.js
git commit -m "feat: integrate GLM-4.7 Flash LLM into ScoutAgent with logic fallback"
```

---

## Task 3: Add Unit Tests

**Files:**
- Create: `tests/unit/providers/test-zaiClient.js`
- Create: `tests/unit/agents/test-scoutAgent-llm.js`

- [ ] **Step 1: Create Z.ai client test**

```javascript
// tests/unit/providers/test-zaiClient.js
const assert = require('assert');
const ZaiClient = require('../../../src/providers/zaiClient');

describe('ZaiClient', () => {
  it('should initialize with config', () => {
    const client = new ZaiClient({
      model: 'glm-4-flash',
      temperature: 0.5
    });

    assert.equal(client.model, 'glm-4-flash');
    assert.equal(client.temperature, 0.5);
  });

  it('should generate completion', async function() {
    if (!process.env.ZAI_API_KEY) {
      this.skip('ZAI_API_KEY not set');
    }

    const client = new ZaiClient({ model: 'glm-4-flash' });

    const response = await client.generate(
      'You are a helpful assistant.',
      'Say "test successful"'
    );

    assert.ok(response);
    assert.ok(typeof response === 'string');
    assert.ok(response.length > 0);
  });

  it('should generate JSON output', async function() {
    if (!process.env.ZAI_API_KEY) {
      this.skip('ZAI_API_KEY not set');
    }

    const client = new ZaiClient({ model: 'glm-4-flash' });

    const json = await client.generateJSON(
      'Return only valid JSON.',
      'Return: {"status": "ok", "number": 42}'
    );

    assert.deepEqual(json, { status: 'ok', number: 42 });
  });
});
```

- [ ] **Step 2: Run provider tests**

```bash
npm test tests/unit/providers/test-zaiClient.js
```

Expected: Tests pass (or skip if no API key)

- [ ] **Step 3: Create ScoutAgent LLM test**

```javascript
// tests/unit/agents/test-scoutAgent-llm.js
const assert = require('assert');
const ScoutAgent = require('../../../src/agents/analysis/scoutAgent');

describe('ScoutAgent LLM Integration', () => {
  let scoutAgent;

  before(() => {
    scoutAgent = new ScoutAgent();
  });

  it('should initialize with LLM client', () => {
    assert.ok(scoutAgent.llmClient);
    assert.equal(scoutAgent.model, 'glm-4-flash');
  });

  it('should build valid analysis prompt', () => {
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

  it('should analyze pool with LLM or fallback', async function() {
    if (!process.env.ZAI_API_KEY) {
      this.skip('ZAI_API_KEY not set');
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
});
```

- [ ] **Step 4: Run ScoutAgent tests**

```bash
npm test tests/unit/agents/test-scoutAgent-llm.js
```

Expected: Tests pass (or skip if no API key)

- [ ] **Step 5: Commit tests**

```bash
git add tests/
git commit -m "test: add unit tests for LLM provider and ScoutAgent"
```

---

## Task 4: Integration Testing & Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/llm-integration.md`

- [ ] **Step 1: Test full pipeline with real LLM**

Run: `node index.js`

Verify in logs:
```
ScoutAgent initialized with LLM: glm-4-flash
ScoutAgent: Used LLM analysis for SOL
ScoutAgent: LLM analysis complete for TRUMP
```

- [ ] **Step 2: Add documentation**

Create `docs/llm-integration.md`:

```markdown
# LLM Integration

## Overview

ScoutAgent uses GLM-4.7 Flash via Z.ai API for intelligent pool analysis.

## Setup

1. Get API key from Z.ai
2. Add to `.env`:
   ```
   ZAI_API_KEY=your_key_here
   ```

## Architecture

- **Provider**: `src/providers/zaiClient.js`
- **Agent**: `src/agents/analysis/scoutAgent.js`
- **Model**: GLM-4.7 Flash (glm-4-flash)

## Fallback

If LLM fails, ScoutAgent falls back to logic-based analysis:
1. `recommendFromLpers()` - Mirror top LPers
2. `recommendFromPriceAction()` - Price/volatility analysis

## Cost Management

- Only analyzes top 5 pools per cycle
- ~1500 tokens per analysis
- Logic fallback saves API costs

## Testing

```bash
npm test tests/unit/agents/test-scoutAgent-llm.js
```
```

- [ ] **Step 3: Update README**

Add to `README.md`:

```markdown
## LLM Integration

The system uses **GLM-4.7 Flash** for intelligent pool analysis via Z.ai API.

### Setup

1. Get API key from [Z.ai](https://zukijourney.com)
2. Add to `.env`: `ZAI_API_KEY=your_key`
3. Restart: `node index.js`

### Behavior

- Primary: LLM analyzes pools with context
- Fallback: Logic-based analysis if API fails
- Cost: ~5 calls per cycle (top pools only)
```

- [ ] **Step 4: Final commit**

```bash
git add docs/ README.md
git commit -m "docs: add LLM integration documentation"
```

---

## Self-Review

**1. Spec Coverage:**
✅ LLM integration with GLM-4.7 Flash
✅ Maintain existing data inputs
✅ Preserve scoring criteria (7-10 ENTER, 5-6.9 CONSIDER, <5 SKIP)
✅ Preserve JSON output format
✅ Logic-based fallback
✅ Error handling
✅ Testing

**2. Placeholder Scan:**
✅ No TBD/TODO
✅ No "implement later"
✅ All code blocks complete
✅ Exact file paths
✅ Exact commands

**3. Type Consistency:**
✅ Strategy type matches across methods
✅ Score range consistent (0-10)
✅ Recommendation strings consistent ('ENTER', 'CONSIDER', 'SKIP')

**No issues found.**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-30-scout-agent-llm-integration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
