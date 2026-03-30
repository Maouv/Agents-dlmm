# DLMM Paper Trader

Multi-agent paper trading system untuk DLMM (Dynamic Liquidity Market Maker) pools di Solana.

## Overview

Event-driven multi-agent system untuk automated paper trading di Meteora DLMM pools.  
**Strategi utama:** Copy Trade Top LPers — mirror setup dari top performer LPers di tiap pool.

## Architecture

```
data:ready
    ↓
ScoutAgent (Kimi K2/Groq) — analisis pool + top LPers
    ↓ scout:complete
RiskAgent (Qwen3-32B/Groq) — validasi risiko
StrategyAgent (GLM-5/Modal) — copy top LPer setup
    ↓ decision:ready
MotherAgent (GLM-5/Modal) ←→ Maou via Telegram
    ↓ (approved)
ExecutionAgent (Gemini 2.5 Flash) — buka/kelola/tutup posisi
    ↓ trade:closed
MemoryAgent (Qwen3-32B/Groq) — extract lessons, update journal
```

**MotherAgent** adalah satu-satunya agent yang berhadapan langsung dengan Maou via Telegram — monitor semua agent, bisa override keputusan, dan jadi final decision maker.

## Status Per Agent

| Agent | File | LLM | Status |
|-------|------|-----|--------|
| ScoutAgent | `src/agents/analysis/scoutAgent.js` | Kimi K2 (Groq) | ✅ Done |
| RiskAgent | `src/agents/decision/riskAgent.js` | Qwen3-32B (Groq) | ❌ Todo |
| StrategyAgent | `src/agents/decision/strategyAgent.js` | GLM-5 (Modal key 2) | ❌ Todo |
| MotherAgent | `src/agents/mother/index.js` | GLM-5 (Modal key 1) | ⚠️ Stub, belum LLM |
| ExecutionAgent | `src/agents/execution/executionAgent.js` | Gemini 2.5 Flash | ⚠️ Rule-based, belum LLM |
| MemoryAgent | `src/agents/memory/memoryAgent.js` | Qwen3-32B (Groq) | ⚠️ Rule-based, belum LLM |

## LLM Providers

| Provider | Model | Digunakan untuk |
|----------|-------|-----------------|
| Groq | `moonshotai/kimi-k2-instruct` | ScoutAgent |
| Groq | `qwen3-32b` | RiskAgent, MemoryAgent |
| Modal (key 1) | `glm-5` | MotherAgent |
| Modal (key 2) | `glm-5` | StrategyAgent |
| Google AI | `gemini-2.5-flash` | ExecutionAgent |

## Setup

### Prerequisites

- Node.js >= 20.0.0

### Installation

```bash
npm install
cp .env.example .env
# Edit .env dengan API keys
```

### Environment Variables

```bash
# Required sekarang
GROQ_API_KEY=your_key

# Required untuk phase selanjutnya
MODAL_API_KEY_1=your_key      # MotherAgent
MODAL_API_KEY_2=your_key      # StrategyAgent
GOOGLE_AI_API_KEY=your_key    # ExecutionAgent

# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Paper Trading
PAPER_TRADING_STARTING_BALANCE=100
CYCLE_INTERVAL_MINUTES=60
```

### Running

```bash
npm run dev   # development
npm start     # production
```

## Project Structure

```
agents_dlmm/
├── src/
│   ├── agents/
│   │   ├── analysis/
│   │   │   └── scoutAgent.js            ✅ LLM integrated (Kimi K2)
│   │   ├── decision/
│   │   │   ├── decisionAgent.js         ⚠️ needs refactor
│   │   │   ├── riskAgent.js             ❌ todo
│   │   │   ├── strategyAgent.js         ❌ todo
│   │   │   ├── decisionOrchestrator.js  ❌ todo
│   │   │   └── prompts.js               ❌ todo
│   │   ├── execution/
│   │   │   ├── executionAgent.js        ⚠️ needs LLM (SL/TP)
│   │   │   └── paperTradingEngine.js
│   │   ├── memory/
│   │   │   └── memoryAgent.js           ⚠️ needs LLM
│   │   └── mother/
│   │       └── index.js                 ⚠️ stub, needs LLM
│   ├── providers/
│   │   ├── llmProvider.js               ✅ base class
│   │   ├── groqClient.js                ✅ done
│   │   ├── zaiClient.js                 ✅ done (backup)
│   │   ├── modalClient.js               ❌ todo
│   │   └── geminiClient.js              ❌ todo
│   ├── core/                            ✅ done
│   ├── data/                            ✅ done
│   └── utils/
├── data/
│   ├── agents.db
│   └── logs/
├── tests/unit/
└── docs/
    └── llm-integration.md
```

## Copy Trade Top LPers Strategy

**Entry Logic:**
- Scout temukan pool dengan top LPers aktif
- RiskAgent validasi: TVL > $10k, market cap layak
- StrategyAgent copy parameter top LPer: bin step, range, hold time
- MotherAgent approve via Telegram
- ExecutionAgent buka posisi paper

**Exit Logic:**
- Take profit: mirror avg ROI top LPers (max 25%)
- Stop loss: berbasis volatility (5-15%)
- Max hold: 1.5x avg hold time top LPers

## Phase Progress

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| 1 | Core infrastructure | ✅ Done |
| 2 | Data layer | ✅ Done |
| 3 | ScoutAgent LLM | ✅ Done |
| 4 | Decision Agents (Risk + Strategy) | 🚧 Next |
| 5 | MotherAgent LLM + Telegram | ❌ Todo |
| 6 | ExecutionAgent LLM | ❌ Todo |
| 7 | MemoryAgent LLM | ❌ Todo |
| 8 | End-to-end integration | ❌ Todo |

## Monitoring

```bash
tail -f data/logs/system-$(date +%Y-%m-%d).log
```

## Links

- [Meteora DLMM Docs](https://docs.meteora.ag/api-reference/dlmm/overview)
- [LP Agent IO Docs](https://docs.lpagent.io/introduction)
- [LLM Integration Docs](./docs/llm-integration.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)

## Author

Maou

