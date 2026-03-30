# DLMM Paper Trader - Implementation Plan

**Project:** DLMM Paper Trader (MVP - Phase 1)
**Strategy:** Copy Trade Top LPers (primary), Rug Me (fallback)
**Date:** 2026-03-25 (created), 2026-03-30 (updated)

---

## 🔄 Latest Updates (2026-03-30)

### ScoutAgent LLM Integration - COMPLETED ✅

**What was built:**
1. **LLM Provider Infrastructure**
   - `src/providers/llmProvider.js` - Generic LLM interface
   - `src/providers/groqClient.js` - Groq API client (Kimi K2)
   - Native Node.js fetch (no external dependencies)

2. **ScoutAgent Redesign**
   - Integrated Kimi K2 Instruct via Groq
   - Batch analysis (all pools in 1 request)
   - Logic fallback system
   - Structured JSON output with validation

3. **Testing & Documentation**
   - Unit tests for GroqClient & ScoutAgent
   - Integration test passed (test-llm-integration.js)
   - Updated docs/llm-integration.md
   - Updated README.md

**Key Decisions:**
- Switched from Z.ai → Groq (rate limit issues)
- Batch analysis to respect 60 req/min limit
- Kimi K2 for strong agentic tool use
- Temperature 0.3, max tokens 2000

**Test Results:**
```
✅ LLM integration working
✅ Score: 8.5/10 → ENTER recommendation
✅ Reasoning with risk factors
✅ Confidence: high
```

---

## 📋 Executive Summary

**System Type:** Event-driven multi-agent paper trading system
**Strategy:** Rug Me (single-sided SOL DLMM at bottom range)
**Data Sources:** Dexscreener, Solscan, Meteora, Jupiter, GeckoTerminal
**LLM Providers:** Modal, Groq, OpenRouter, Z.ai, Google AI Studio
**Communication:** Telegram bot for notifications + manual intervention
**Database:** SQLite for state & trade journal

---

## 🎯 Phase Breakdown

### **Phase 1: Core Infrastructure** ⏱️ Est. 3-4 sessions COMPLETED ✅

**Goal:** Setup basic system skeleton with event bus, state management, and 1 agent

**Deliverables:**
- [x ] Project setup (package.json, folder structure)
- [x ] Environment variables configuration
- [x ] SQLite database schema
- [x ] Event bus implementation
- [x ] State manager implementation
- [ x] Logger utility
- [ x] Cycle manager (timer + manual trigger)
- [ ] Basic orchestrator
- [ ] Mother Agent (simplified, no LLM yet - just logging)
- [x ] Test: System dapat run cycle dengan timer, emit events, save state

**Files to create:**
```
package.json
.env.example
src/core/eventBus.js
src/core/stateManager.js
src/core/cycleManager.js
src/core/orchestrator.js
src/utils/logger.js
data/agents.db (auto-created)
index.js
```

---

### **Phase 2: Data Layer** ⏱️ Est. 2-3 sessions COMPLETED ✅

**Goal:** Implement all Node.js data fetcher scripts (no LLM)

**Deliverables:**
- [x] Pool scanner (Meteora API)
- [x] Price fetcher (Dexscreener API)
- [x] Volume tracker (Dexscreener API)
- [x] Token metrics fetcher (Solscan API)
- [x] Data aggregation & filtering logic (`aggregator-v2.js`)
- [x] LP Agent fetcher (`lpAgentFetcher.js`) — bonus
- [x] Basic error handling & retry logic
- [x] Test: Fetch real data, filter pools, emit data:ready event

**Files to create:**
```
src/data/poolScanner.js
src/data/priceFetcher.js
src/data/volumeTracker.js
src/data/tokenMetricsFetcher.js
src/data/index.js (aggregator)
```

**Database tables:**
```sql
CREATE TABLE pools (
  pool_address TEXT PRIMARY KEY,
  token_symbol TEXT,
  token_address TEXT,
  base_fee REAL,
  tvl REAL,
  created_at TIMESTAMP
);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  pool_address TEXT,
  price REAL,
  ath_price REAL,
  bottom_price REAL,
  timestamp TIMESTAMP
);
```

---

### **Phase 3: Analysis Agents** ⏱️ Est. 3-4 sessions

**Goal:** Implement ScoutAgent (Pool Analyst) with LLM integration

**Status:** ✅ COMPLETED (2026-03-30)

**Deliverables:**
- [x] LLM provider infrastructure (llmProvider.js, groqClient.js)
- [x] ScoutAgent with Kimi K2 Instruct (Groq)
- [x] Batch analysis implementation
- [x] Logic fallback system
- [x] Prompt templates for analysis
- [x] JSON output parsing with validation
- [x] Temperature settings (0.3)
- [x] Unit tests + integration test
- [ ] Market Condition agent (optional, covered by ScoutAgent)

**Files created:**
```
src/providers/llmProvider.js
src/providers/groqClient.js
src/agents/analysis/scoutAgent.js (redesigned)
tests/unit/providers/test-groqClient.js
tests/unit/agents/test-scoutAgent-llm.js
test-llm-integration.js
docs/llm-integration.md
```

**Env vars used:**
```bash
GROQ_API_KEY (for Kimi K2)
```

**Key Features:**
- Batch analysis (all pools in 1 LLM call)
- Rate limit friendly (Groq: 10k tokens/min, 60 req/min)
- Logic fallback when LLM fails
- Structured output with risk factors

---

### **Phase 4: Decision Agents** ⏱️ Est. 3-4 sessions ✅ COMPLETED

**Goal:** Implement RiskAgent + StrategyAgent dengan Copy Top LPers strategy

**Status:** ✅ COMPLETED (2026-03-30)

**Architecture:**
```
ScoutAgent output + Top LPers data
    ↓
RiskAgent (GLM-5/Modal key 2) — approve/reject pool
    ↓ (approved)
StrategyAgent (GLM-5/Modal key 3) — copy top LPer: entry, bin step, SL/TP, DCA
    ↓
DecisionOrchestrator — compile final recommendation
    ↓
MotherAgent
```

**Deliverables:**
- [x] Fix bug `pool_validation` di `decisionAgent.js` (semua pool reject)
- [x] `modalClient.js` provider
- [x] RiskAgent (GLM-5 Modal key 2)
- [x] StrategyAgent (GLM-5 Modal key 3)
- [x] DecisionOrchestrator
- [x] `prompts.js` (Risk + Strategy prompts)
- [x] Copy-top-LPs matching logic
- [x] DCA calculation (triggered by price drop %)
- [x] Exit condition (SL/TP % based + max hold time)
- [x] Confidence score calculation
- [x] Test: agents make real LLM decisions, emit recommendations

**Files created:**
```
src/providers/modalClient.js
src/agents/decision/riskAgent.js
src/agents/decision/strategyAgent.js
src/agents/decision/decisionOrchestrator.js
src/agents/decision/prompts.js
tests/unit/providers/test-modalClient.js
tests/unit/agents/test-riskAgent.js
tests/unit/agents/test-strategyAgent.js
tests/unit/agents/test-decisionOrchestrator.js
```

**Env vars used:**
```bash
MODAL_API_KEY_2    # RiskAgent
MODAL_API_KEY_3    # StrategyAgent
```

**Test Results:**
```
✅ RiskAgent: Approved pool with risk score 7.5/10
✅ StrategyAgent: Copy top LPers strategy formulated
✅ DecisionOrchestrator: Pipeline working end-to-end
✅ pool_validation bug fixed
✅ All agents making real LLM decisions
```

---

### **Phase 5: Mother Agent** ⏱️ Est. 2-3 sessions

**Goal:** Implement Mother Agent with full decision logic

**Deliverables:**
- [ ] Mother Agent (GLM-5 via Modal key 1)
- [ ] Risk threshold check (≥7.5 veto)
- [ ] Confidence-based decision tree
- [ ] Manual review trigger logic
- [ ] Decision logging
- [ ] Fallback model logic (GLM-4.7 Flash as fallback)
- [ ] Test: Mother makes final decisions

**Files to create:**
```
src/agents/mother/index.js
src/agents/mother/prompts.js
src/utils/fallback.js
```

**Env vars needed:**
```bash
MODAL_API_KEY_1
```

---

### **Phase 6: Telegram Bot** ⏱️ Est. 2-3 sessions 🚧 Partial

**Goal:** Implement Telegram notification & manual intervention

**Deliverables:**
- [x] Telegram bot setup (`src/telegram/telegramBot.js`)
- [x] Notification formatting
- [x] Manual review flow (pause cycle, wait response)
- [ ] User commands: `gas`, `reject`, `stop`
- [x] Timeout logic (5 minutes)
- [x] Test: User can approve/reject via Telegram

**Files to create:**
```
src/services/telegramBot.js
```

**Env vars needed:**
```bash
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

---

### **Phase 7: Execution Agents** ⏱️ Est. 3-4 sessions 🚧 Partial

**Goal:** Implement Portfolio & Execution agents for paper trading

**Deliverables:**
- [x] Paper trading engine (`paperTradingEngine.js`)
- [x] Position monitor (`positionMonitor.js`)
- [ ] ExecutionAgent LLM integration (Llama 3.3 70B/Groq) — belum
- [ ] SL/TP dynamic via LLM — belum
- [ ] DLMM position simulation (full simulation)
- [ ] Fee tracking via Meteora API
- [ ] Position scaling logic (rolling positions)
- [ ] Position state tracking
- [ ] Test: System opens & closes paper positions

**Files to create:**
```
src/agents/execution/portfolioAgent.js
src/agents/execution/executionAgent.js
src/core/paperTradingManager.js
```

**Env vars needed:**
```bash
OPENROUTER_API_KEY_2
GOOGLE_AI_API_KEY
```

**Database tables:**
```sql
CREATE TABLE positions (
  position_id TEXT PRIMARY KEY,
  pool_address TEXT,
  strategy TEXT,
  entry_price REAL,
  position_size REAL,
  current_price REAL,
  fees_earned REAL,
  status TEXT, -- 'open', 'closed', 'scaling'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE portfolio_state (
  id INTEGER PRIMARY KEY,
  total_balance REAL,
  available_balance REAL,
  total_pnl REAL,
  updated_at TIMESTAMP
);
```

---

### **Phase 8: Journal Agent** ⏱️ Est. 2-3 sessions

**Goal:** Implement trade journaling & pattern extraction

**Deliverables:**
- [ ] Journal Agent (Qwen3-32B via Groq)
- [ ] Trade recording to SQLite
- [ ] Pattern extraction (win rate, performance metrics)
- [ ] Quick update per trade
- [ ] Deep analysis (daily batch)
- [ ] Journal summary for Strategy Agent
- [ ] Test: Patterns extracted from trade history

**Files to create:**
```
src/agents/memory/journalAgent.js
src/agents/memory/prompts.js
```

**Database tables:**
```sql
CREATE TABLE trades (
  trade_id TEXT PRIMARY KEY,
  pool_address TEXT,
  token_symbol TEXT,
  strategy TEXT,
  entry_price REAL,
  exit_price REAL,
  entry_reason TEXT,
  exit_reason TEXT,
  position_size REAL,
  pnl_usd REAL,
  pnl_percentage REAL,
  fees_earned REAL,
  total_return REAL,
  time_held_minutes INTEGER,
  entry_timestamp TIMESTAMP,
  exit_timestamp TIMESTAMP
);

CREATE TABLE patterns (
  id INTEGER PRIMARY KEY,
  pattern_type TEXT,
  strategy TEXT,
  metric_name TEXT,
  metric_value REAL,
  sample_size INTEGER,
  updated_at TIMESTAMP
);

CREATE TABLE agent_decisions (
  id INTEGER PRIMARY KEY,
  trade_id TEXT,
  agent_name TEXT,
  decision TEXT,
  reasoning TEXT,
  confidence REAL,
  timestamp TIMESTAMP
);
```

---

### **Phase 9: Exit Monitoring** ⏱️ Est. 2-3 sessions

**Goal:** Implement position monitoring & exit execution

**Deliverables:**
- [ ] Price monitoring between cycles
- [ ] Bottom price tracking (lowest since ATH)
- [ ] Recovery % calculation
- [ ] Exit condition checks (scale-out, sideways, breakdown)
- [ ] Position rolling logic (DCA)
- [ ] Exit event emission
- [ ] Test: System exits positions correctly

**Files to create:**
```
src/core/positionMonitor.js
src/utils/exitLogic.js
```

---

### **Phase 10: Performance Tracking** ⏱️ Est. 1-2 sessions

**Goal:** Implement performance metrics & reporting

**Deliverables:**
- [ ] Performance calculator
- [ ] Extended metrics (Sharpe, drawdown, etc.)
- [ ] Daily performance summary
- [ ] Telegram performance reports
- [ ] Performance file logging
- [ ] Test: User can view performance

**Files to create:**
```
src/utils/performanceTracker.js
```

**Database tables:**
```sql
CREATE TABLE performance_metrics (
  id INTEGER PRIMARY KEY,
  date TEXT,
  total_trades INTEGER,
  win_rate REAL,
  total_pnl REAL,
  avg_return REAL,
  sharpe_ratio REAL,
  max_drawdown REAL,
  updated_at TIMESTAMP
);
```

---

### **Phase 11: Integration Testing** ⏱️ Est. 2-3 sessions

**Goal:** Full system integration test with real APIs

**Deliverables:**
- [ ] End-to-end cycle test
- [ ] Multi-position test
- [ ] Manual intervention test
- [ ] Fallback model test
- [ ] Error handling test
- [ ] Performance report test
- [ ] Bug fixes
- [ ] Test: System runs for 24 hours without errors

---

### **Phase 12: Documentation & Deployment** ⏱️ Est. 1-2 sessions

**Goal:** Document system & prepare for deployment

**Deliverables:**
- [ ] README.md (setup, configuration, usage)
- [ ] API documentation
- [ ] Strategy guide
- [ ] Troubleshooting guide
- [ ] Deployment script (tmux/systemd)
- [ ] Monitoring setup
- [ ] Backup strategy

---

## 📊 Database Schema Summary

```sql
-- Pools & Price Data
CREATE TABLE pools ( ... );
CREATE TABLE price_history ( ... );

-- Positions & Trading
CREATE TABLE positions ( ... );
CREATE TABLE portfolio_state ( ... );
CREATE TABLE trades ( ... );

-- Learning & Analytics
CREATE TABLE patterns ( ... );
CREATE TABLE agent_decisions ( ... );
CREATE TABLE performance_metrics ( ... );

-- System State
CREATE TABLE system_state (
  id INTEGER PRIMARY KEY,
  cycle_count INTEGER,
  last_cycle TIMESTAMP,
  active_strategies TEXT, -- JSON
  current_models TEXT, -- JSON for fallback tracking
  updated_at TIMESTAMP
);
```

---

## 🔧 Configuration Files

### `.env` (User provides)
```bash
# Modal
MODAL_API_KEY_1=your_key
MODAL_API_KEY_2=your_key

# Groq
GROQ_API_KEY=your_key

# OpenRouter
OPENROUTER_API_KEY_1=your_key
OPENROUTER_API_KEY_2=your_key

# Z.ai
ZAI_API_KEY=your_key

# Google AI
GOOGLE_AI_API_KEY=your_key

# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Paper Trading
PAPER_TRADING_STARTING_BALANCE=100

# Optional - Solscan (if needed)
SOLSCAN_API_KEY=your_key
```

### `src/config/agents.js`
```javascript
module.exports = {
  mother: {
    model: 'glm-5',
    provider: 'modal',
    temperature: 0.1,
    fallback: {
      model: 'glm-4.7-flash',
      provider: 'zai'
    }
  },
  // ... other agents
}
```

### `src/config/strategies/rug-me.json`
(Already defined above)

---

## 🎯 Success Criteria

**Phase 1 Complete When:**
- ✅ System runs cycle every 1 hour
- ✅ Events emit correctly
- ✅ State saves to SQLite

**Phase 2 Complete When:**
- ✅ Real data fetched from APIs
- ✅ Pools filtered correctly
- ✅ Data ready for analysis

**Phase 3-5 Complete When:**
- ✅ Agents make real LLM calls
- ✅ Decisions logged
- ✅ Manual review works

**Phase 6-10 Complete When:**
- ✅ Paper positions opened/closed
- ✅ Fees tracked
- ✅ Exit logic works
- ✅ Journal extracts patterns
- ✅ Performance reports sent

**Phase 11-12 Complete When:**
- ✅ System runs 24h without errors
- ✅ Documented & ready for production

---

## 📝 Notes

- Each phase builds on previous phases
- User can test each phase independently
- If issues found, can go back to fix
- Flexibility to adjust based on real testing
- Phase 1-2 = No LLM costs
- Phase 3+ = LLM API costs apply

---

## Current tree dir

├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md
├── README.md
├── data
│   ├── agents.db
│   ├── agents.db-shm
│   ├── agents.db-wal
│   └── logs
│       ├── system-2026-03-25.log
│       ├── system-2026-03-26.log
│       ├── system-2026-03-29.log
│       └── system-2026-03-30.log
├── docs
│   ├── llm-integration.md
│   └── superpowers
│       └── plans
│           └── 2026-03-30-scout-agent-llm-integration.md
├── index.js
├── package-lock.json
├── package.json
├── src
│   ├── agents
│   │   ├── analysis
│   │   │   └── scoutAgent.js
│   │   ├── decision
│   │   │   └── decisionAgent.js
│   │   ├── execution
│   │   │   ├── executionAgent.js
│   │   │   ├── paperTradingEngine.js
│   │   │   ├── positionMonitor.js
│   │   │   └── realExecutionAgent.js
│   │   ├── memory
│   │   │   └── memoryAgent.js
│   │   └── mother
│   │       └── index.js
│   ├── config
│   │   └── strategies
│   ├── control
│   │   └── modeManager.js
│   ├── core
│   │   ├── cycleManager.js
│   │   ├── eventBus.js
│   │   ├── orchestrator.js
│   │   └── stateManager.js
│   ├── data
│   │   ├── aggregator-v2.js
│   │   ├── index.js
│   │   ├── lpAgentFetcher.js
│   │   ├── poolScanner.js
│   │   ├── priceFetcher.js
│   │   ├── tokenMetricsFetcher.js
│   │   └── volumeTracker.js
│   ├── providers
│   │   ├── groqClient.js
│   │   ├── llmProvider.js
│   │   └── zaiClient.js
│   ├── services
│   │   └── dlmmSDK.js
│   ├── telegram
│   │   └── telegramBot.js
│   └── utils
│       └── logger.js
├── test-llm-integration.js
├── test-mode-telegram.js
├── test-phase1.js
├── test-phase2.js
├── test-phase3.js
├── test-phase4.js
├── test-phase5.js
└── tests
    └── unit
        ├── agents
        │   └── test-scoutAgent-llm.js
        └── providers
            ├── test-groqClient.js
            └── test-zaiClient.js

