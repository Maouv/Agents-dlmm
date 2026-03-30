# LLM Providers — Reference

Single source of truth untuk endpoint, model ID, rate limit, dan env vars.
Last updated: 2026-03-30

---

## Agent → Provider Mapping

| Agent | Model ID | Provider | Env Var |
|-------|----------|----------|---------|
| MotherAgent | `zai-org/GLM-5-FP8` | Modal (key 1) | `MODAL_API_KEY_1` |
| RiskAgent | `zai-org/GLM-5-FP8` | Modal (key 2) | `MODAL_API_KEY_2` |
| StrategyAgent | `zai-org/GLM-5-FP8` | Modal (key 3) | `MODAL_API_KEY_3` |
| ScoutAgent | `moonshotai/kimi-k2-instruct` | Groq | `GROQ_API_KEY` |
| ExecutionAgent | `llama-3.3-70b-versatile` | Groq | `GROQ_API_KEY` |
| MemoryAgent | `qwen-3-235b-a22b-instruct-2507` | Cerebras | `CEREBRAS_API_KEY` |

---

## Modal

**Endpoint:** `https://api.us-west-2.modal.direct/v1/chat/completions`
**Model ID:** `zai-org/GLM-5-FP8`
**Concurrent:** 1 per key — pakai 3 key berbeda (key 1, 2, 3)
**Format:** OpenAI-compatible

**Env vars:**
```bash
MODAL_API_KEY_1=your_key   # MotherAgent
MODAL_API_KEY_2=your_key   # RiskAgent
MODAL_API_KEY_3=your_key   # StrategyAgent
```

---

## Groq

**Endpoint:** `https://api.groq.com/openai/v1/chat/completions`
**Format:** OpenAI-compatible

**Rate limits (free tier):**

| Model ID | RPM | RPD | TPM | TPD |
|----------|-----|-----|-----|-----|
| `moonshotai/kimi-k2-instruct` | 60 | 1K | 10K | 300K |
| `llama-3.3-70b-versatile` | 30 | 1K | 12K | 100K |
| `qwen/qwen3-32b` | 60 | 1K | 6K | 500K |
| `llama-3.1-8b-instant` | 30 | 14.4K | 6K | 500K |

**Env vars:**
```bash
GROQ_API_KEY=your_key
```

**Catatan:**
- ScoutAgent pakai `kimi-k2-instruct` — 60 RPM cukup untuk batch analysis
- ExecutionAgent pakai `llama-3.3-70b-versatile` — TPM 12K lebih aman untuk real-time
- `llama-3.1-8b-instant` tersedia sebagai emergency fallback (RPD 14.4K)

---

## Cerebras

**Endpoint:** `https://api.cerebras.ai/v1/chat/completions`
**Format:** OpenAI-compatible

**Rate limits (free tier):**

| Model ID | Context | RPM | RPD | TPM | TPD |
|----------|---------|-----|-----|-----|-----|
| `qwen-3-235b-a22b-instruct-2507` | 65,536 | 30 | 900 | 30K | 1M |
| `llama3.1-8b` | 8,192 | 30 | 900 | 60K | 1M |

**Env vars:**
```bash
CEREBRAS_API_KEY=your_key
```

**Catatan:**
- MemoryAgent pakai `qwen-3-235b-a22b-instruct-2507` — model besar, TPD 1M sangat longgar
- Status model: **Preview** (bisa berubah)

---

## .env Template Lengkap

```bash
# Modal — GLM-5 (1 concurrent per key)
MODAL_API_KEY_1=your_key        # MotherAgent
MODAL_API_KEY_2=your_key        # RiskAgent
MODAL_API_KEY_3=your_key        # StrategyAgent

# Groq — ScoutAgent + ExecutionAgent
GROQ_API_KEY=your_key

# Cerebras — MemoryAgent
CEREBRAS_API_KEY=your_key

# Telegram
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Paper Trading
PAPER_TRADING_STARTING_BALANCE=100
CYCLE_INTERVAL_MINUTES=60

# Debug
DEBUG=false
```

---

## Client Files

| Provider | Client | Status |
|----------|--------|--------|
| Groq | `src/providers/groqClient.js` | ✅ Done |
| Modal | `src/providers/modalClient.js` | ❌ Todo |
| Cerebras | `src/providers/cerebrasClient.js` | ❌ Todo |
| Z.ai | `src/providers/zaiClient.js` | ✅ Done (backup/testing) |

