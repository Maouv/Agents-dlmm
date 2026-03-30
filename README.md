# DLMM Paper Trader

Multi-agent paper trading system for DLMM (Dynamic Liquidity Market Maker) pools on Solana.

## Overview

This system implements an event-driven multi-agent architecture for automated paper trading on Meteora DLMM pools. Currently implements the **Rug Me strategy** for Phase 1 MVP.

## Architecture

- **Event-driven microkernel** using Node.js EventEmitter
- **8 specialized agents** with dedicated LLM models
- **SQLite database** for state management and trade journaling
- **Telegram bot** for notifications and manual intervention
- **Paper trading engine** with full DLMM position simulation

## Phase 1 Status

✅ Core infrastructure (event bus, state manager, orchestrator)
✅ Database schema
✅ Mother Agent (simplified)
✅ Cycle manager

🚧 In progress: Data layer, Analysis agents, Decision agents, Execution agents, Telegram bot

## Setup

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment template:
```bash
cp .env.example .env
```

3. Configure your API keys in `.env`:
```bash
# Required for Phase 3+
MODAL_API_KEY_1=your_key
MODAL_API_KEY_2=your_key
GROQ_API_KEY=your_key
OPENROUTER_API_KEY_1=your_key
OPENROUTER_API_KEY_2=your_key
ZAI_API_KEY=your_key
GOOGLE_AI_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Running

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Configuration

### Cycle Interval

Set in `.env`:
```bash
CYCLE_INTERVAL_MINUTES=60
```

### Paper Trading Balance

Set in `.env`:
```bash
PAPER_TRADING_STARTING_BALANCE=100
```

### Debug Mode

Enable verbose logging:
```bash
DEBUG=true
```

## Project Structure

```
agents_dlmm/
├── src/
│   ├── core/               # Core system components
│   │   ├── orchestrator.js
│   │   ├── eventBus.js
│   │   ├── stateManager.js
│   │   └── cycleManager.js
│   ├── agents/             # Agent implementations
│   │   ├── mother/
│   │   ├── analysis/
│   │   ├── decision/
│   │   ├── execution/
│   │   └── memory/
│   ├── data/               # Data fetcher scripts
│   ├── services/           # External services
│   ├── config/             # Configuration files
│   │   └── strategies/     # Strategy JSON files
│   └── utils/              # Utilities
├── data/                   # Database and logs
│   ├── agents.db
│   └── logs/
├── index.js                # Entry point
├── package.json
└── .env
```

## Strategy: Rug Me

**Entry Conditions:**
- Token price down 30-50% from ATH
- Market cap > 200k
- Volume > 5k/minute
- TVL < 100k
- Token age 3h - 7d

**DLMM Setup:**
- Single-sided SOL
- -80% minprice SPOT range
- Rolling positions (1 SOL per entry)

**Exit Logic:**
- Scale-out at 10%, 30%, 40% recovery from bottom
- Sideways exit (stuck in -70% to -80% range for 1 hour)
- Breakdown exit (price breaks below -80% minprice)

## Agents

| Agent | Model | Provider | Purpose |
|-------|-------|----------|---------|
| Mother Agent | GLM-5 | Modal | Final decisions, orchestration |
| Pool Analyst | Kimi K2 Instruct | OpenRouter | Pool analysis |
| Market Condition | GLM-4.7 Flash | Z.ai | Market analysis |
| Risk Agent | Qwen3-32B | Groq | Risk assessment |
| Strategy Agent | GLM-5 | Modal | Strategy matching |
| Portfolio Agent | Step 3.5 Flash | OpenRouter | Portfolio management |
| Execution Agent | Gemini 2.5 Flash | Google AI | Trade execution |
| Journal Agent | Qwen3-32B | Groq | Pattern extraction |

## LLM Integration

The system uses **Kimi K2 Instruct** for intelligent pool analysis via Groq API.

### Setup

1. Get API key from [Groq](https://console.groq.com)
2. Add to `.env`: `GROQ_API_KEY=your_key`
3. Restart: `node index.js`

### Behavior

- **Primary**: LLM analyzes ALL pools in one batch request (avoid rate limits)
- **Fallback**: Logic-based analysis if API fails
- **Cost**: Free tier available
- **Model**: `moonshotai/kimi-k2-instruct`
- **Limits**: 10k tokens/min, 60 requests/min

See [docs/llm-integration.md](./docs/llm-integration.md) for details.

## Database Schema

See `src/core/stateManager.js` for complete schema.

Main tables:
- `system_state` - Global state tracking
- `pools` - Pool metadata
- `price_history` - Price tracking
- `positions` - Active positions
- `portfolio_state` - Balance tracking
- `trades` - Trade history
- `patterns` - Extracted patterns
- `agent_decisions` - Decision logs
- `performance_metrics` - Performance tracking

## Implementation Plan

See `IMPLEMENTATION_PLAN.md` for detailed phase breakdown.

**Phase 1:** Core infrastructure ✅
**Phase 2:** Data layer 🚧
**Phase 3:** Analysis agents
**Phase 4:** Decision agents
**Phase 5:** Mother Agent (full)
**Phase 6:** Telegram bot
**Phase 7:** Execution agents
**Phase 8:** Journal agent
**Phase 9:** Exit monitoring
**Phase 10:** Performance tracking
**Phase 11:** Integration testing
**Phase 12:** Documentation & deployment

## Development

### Adding a New Agent

1. Create agent file in `src/agents/<layer>/<name>.js`
2. Extend base Agent class (TODO: create base class)
3. Register in orchestrator
4. Setup event listeners

### Adding a New Strategy

1. Create JSON file in `src/config/strategies/`
2. Follow schema from `rug-me.json`
3. Strategy Agent will auto-load

## Monitoring

Check logs:
```bash
tail -f data/logs/system-$(date +%Y-%m-%d).log
```

## Troubleshooting

### Database locked
- SQLite WAL mode enabled
- Check for concurrent processes

### Missing dependencies
```bash
npm install
```

### Environment variables not loaded
- Ensure `.env` file exists
- Check file permissions

## License

MIT

## Author

Maou

## Links

- [Meteora DLMM Docs](https://docs.meteora.ag/api-reference/dlmm/overview)
- [Jupiter API](https://dev.jup.ag/docs)
- [Implementation Plan](./IMPLEMENTATION_PLAN.md)
