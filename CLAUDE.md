# CLAUDE.md — DLMM Paper Trader
> Dibaca Claude di awal setiap sesi. Berisi context + aturan kerja.
> Detail teknis ada di `docs/providers.md` dan `IMPLEMENTATION_PLAN.md`.
> Last updated: 2026-03-30

---

## Konteks Proyek

- **Proyek:** DLMM Paper Trader — standalone Node.js multi-agent system
- **User:** Maou — developer, self-hosted VPS (Contabo), Node.js + Linux
- **Strategy:** Copy Trade Top LPers (mirror setup top LPers di tiap pool)
- **Mode:** Paper trading dengan data real (Meteora + LP Agent IO + GeckoTerminal)
- **Runtime:** Node.js 22, SQLite, event-driven (EventEmitter)

---

## Aturan Kerja

- **Kritis dulu, setuju nanti** — kalau ada approach lebih baik, langsung bilang
- **To the point** — tidak perlu basa-basi
- **Setelah write file, langsung lanjut** tanpa tunggu konfirmasi
- **Jangan pause di tengah implementasi** kecuali ada error
- **Jangan ngarang** — kalau tidak tahu endpoint/model ID/rate limit, bilang tidak tahu
- **Selalu cek `docs/providers.md`** sebelum nulis kode yang involve LLM provider
- **Backup dulu** sebelum modifikasi file yang sudah ada

---

## Arsitektur (5 Agent)

```
data:ready
    ↓
ScoutAgent — analisis pool + top LPers
    ↓ scout:complete
RiskAgent — validasi risiko (approve/reject)
StrategyAgent — copy top LPer setup (entry, bin step, SL/TP)
    ↓ decision:ready
MotherAgent ←→ Maou via Telegram (monitor + final decision)
    ↓ approved
ExecutionAgent — buka/kelola/tutup posisi paper
    ↓ trade:closed
MemoryAgent — extract lessons, update journal
```

---

## Status Agent

| Agent | File | Provider | Status |
|-------|------|----------|--------|
| ScoutAgent | `src/agents/analysis/scoutAgent.js` | Groq / Kimi K2 | ✅ Done |
| RiskAgent | `src/agents/decision/riskAgent.js` | Modal key 2 / GLM-5 | ✅ Done |
| StrategyAgent | `src/agents/decision/strategyAgent.js` | Modal key 3 / GLM-5 | ✅ Done |
| MotherAgent | `src/agents/mother/index.js` | Modal key 1 / GLM-5 | ⚠️ Stub |
| ExecutionAgent | `src/agents/execution/executionAgent.js` | Groq / Llama 3.3 70B | ⚠️ Rule-based |
| MemoryAgent | `src/agents/memory/memoryAgent.js` | Cerebras / Qwen3-235B | ⚠️ Rule-based |

---

## Phase Progress

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| 1 | Core infrastructure | ✅ Done |
| 2 | Data layer | ✅ Done |
| 3 | ScoutAgent LLM | ✅ Done |
| 4 | Decision Agents (Risk + Strategy) | ✅ Done |
| 5 | MotherAgent LLM + Telegram | ❌ Todo |
| 6 | Telegram bot | 🚧 Partial |
| 7 | ExecutionAgent LLM | 🚧 Partial |
| 8 | MemoryAgent LLM | ❌ Todo |
| 9+ | Exit monitoring, performance, integration | ❌ Todo |

---

## Known Issues

- `cerebrasClient.js` belum ada — harus dibuat sebelum MemoryAgent

---

## Docs Referensi

- **Provider details** (endpoint, model ID, rate limit, env vars): `docs/providers.md`
- **Phase breakdown + deliverables**: `IMPLEMENTATION_PLAN.md`
- **LLM integration detail**: `docs/llm-integration.md`
- **Meteora DLMM:** https://docs.meteora.ag/api-reference/dlmm/overview
- **LP Agent IO:** https://docs.lpagent.io/introduction

