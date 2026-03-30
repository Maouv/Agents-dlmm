# CLAUDE.md — DLMM Paper Trader Brainstorming Session
> File ini dibaca Claude di awal setiap sesi dan diperbarui seiring percakapan.
> Last updated: session aktif

---

## Konteks Proyek

- **Proyek:** DLMM Paper Trader — standalone Node.js multi-agent system
- **User:** Maou — developer, self-hosted AI infra, familiar dengan Node.js, Linux, tmux, VPS (Contabo)
- **Mode:** Paper trading, data real (Meteora + Jupiter API)
- **Future:** Ekspansi ke ACP multi-agent, real trading

---

## Cara Kerja Kami

### Claude harus:
- **Kritis dulu, setuju nanti.** Kalau pilihan Maou ada yang lebih baik, langsung bilang + kasih alternatif.
- **Jangan takut bilang salah.** Kalau approach-nya kurang tepat, katakan jelas.
- **Kasih opsi, bukan satu jawaban.** Minimal 2-3 opsi dengan trade-off masing-masing.
- **To the point.** Tidak perlu basa-basi panjang.
- **Update CLAUDE.md** setiap ada keputusan penting yang disepakati.
- **Semua klaim harus berbasis fakta** — sebelum menyebut spesifikasi model, harga, fitur, atau ketersediaan provider, wajib cek langsung dari docs resmi atau sumber terpercaya. Dilarang mengarang atau berasumsi. Kalau belum cek, bilang "belum tahu, biar aku cek dulu".
- **Baca docs secara detail** — jangan hanya baca judul atau summary. Kalau ada URL docs yang diberikan user, baca sampai tuntas sebelum menjawab.
- **Jangan sebut angka, harga, atau fitur tanpa verifikasi** — lebih baik akui tidak tahu daripada ngarang.

### Maou harus:
- Konfirmasi atau tolak opsi yang diberikan Claude

### Workflow Rules:
- **Setelah write file, langsung lanjut** tanpa menunggu konfirmasi. Konfirmasi di akhir setelah semua task selesai.
- **Jangan pause di tengah implementasi** kecuali ada error.
- **Perlakukan workspace dengan hati-hati** — ini kerjaan orang lain yang dibuat dengan capek-capek.

---

## Keputusan yang Sudah Disepakati

- Arsitektur: Pola 3 — Parallel Specialists
- Data layer: Node.js scripts (no LLM, paralel penuh)
- Agent approach: tiap agent punya model sendiri (Opsi A)
- Self-learning: trade journal → feed balik ke context agent
- Sentiment: dilebur ke Risk Agent, data dari Augmento/StockGeist API
- Future: bisa ekspansi ke ACP multi-agent
- Total agent: 8
- Mother Agent: GLM-5 (Modal key 1) — keputusan final
- GLM-5 concurrent: solved dengan 2 API key (key 1 → Mother, key 2 → Strategy)

---

## Agent List Final (Semua Terverifikasi)

| Agent | Layer | Model | Provider | Notes |
|---|---|---|---|---|
| Mother Agent | Orchestration | GLM-5 | Modal (key 1) | Final decision, koordinir semua |
| Pool Analyst | Analysis | Kimi K2 Instruct | OpenRouter | Agentic tool use, 256K context |
| Market Condition | Analysis | GLM-4.7 Flash | Z.ai free tier | $0.07/M input paid, free tier 1 concurrent |
| Risk Agent | Decision | Qwen3-32B | Groq | Reasoning mode, math/logic, FINAL |
| Strategy Agent | Decision | GLM-5 | Modal (key 2) | Deep reasoning, baca journal |
| Portfolio Agent | Execution | Step 3.5 Flash | OpenRouter free | 256K ctx, MoE 196B/11B active, gratis |
| Execution Agent | Execution | Gemini 2.5 Flash | Google AI Studio | Free: 10 RPM, 250 RPD — ⚠️ lihat risiko |
| Journal Agent | Memory | Qwen3-32B | Groq | Pattern extraction, reasoning mode |

---

## Fakta Provider yang Sudah Diverifikasi

### GLM-5 (Zhipu AI) via Modal
- Gratis sampai 30 April 2026
- 1 concurrent per key — solved dengan 2 key berbeda

### GLM-4.7 Flash via Z.ai
- Free tier tersedia, 1 concurrency
- Paid: $0.07/M input, $0.40/M output, 128K context
- OpenRouter: $0.39/M input, $1.75/M output, 202K context

### Kimi K2 Instruct via OpenRouter
- Kuat di agentic tool use, coding, reasoning
- Perlu cek harga terbaru di openrouter.ai/moonshot

### Qwen3-32B via Groq
- Reasoning mode via `reasoning_format` parameter
- Gratis, rate limit cek di console.groq.com/docs/rate-limits

### Step 3.5 Flash via OpenRouter `:free`
- $0/M input & output, 256K context, MoE 196B params 11B active
- Reasoning model, masih aktif (tidak deprecated)

### Gemini 2.5 Flash via Google AI Studio
- Free tier: 10 RPM, 250 RPD — cukup untuk paper trading
- ⚠️ RISIKO: Google potong limit 50-92% tanpa warning (Des 2025)
- Jangan jadikan dependency utama untuk production

### OpenRouter Free Tier (umum)
- 20 RPM, 50 req/hari tanpa top-up
- 1000 req/hari setelah top-up $10 (credit, bukan langganan)
- Model `:free` subject to deprecation kapan saja

---

## Issue yang Belum Diselesaikan

- Model assignment sudah final, tapi belum di-benchmark
- Kriteria filter pool di Node.js script belum dibahas
- Orchestrator pattern detail belum dibahas
- Trade journal / self-learning detail belum dibahas
- Paper trading engine belum dibahas

## Bagian Plan yang Belum Dibahas

- Bagian 3: Orchestrator pattern detail
- Bagian 4: Trade journal / self-learning detail
- Bagian 5: Paper trading engine

### Docs referensi
- Meteora: https://docs.meteora.ag/api-reference/dlmm/overview
- LP Agent: https://docs.lpagent.io/introduction
- Jupiter: https://dev.jup.ag/docs

---

## ScoutAgent Status

**Last updated:** 2026-03-30

### Implementation Details

- **Model:** Kimi K2 Instruct (`moonshotai/kimi-k2-instruct`)
- **Provider:** Groq API
- **Client:** `src/providers/groqClient.js`
- **Agent:** `src/agents/analysis/scoutAgent.js`

### Key Features

- ✅ **Batch LLM Analysis** - Analyze semua pools dalam 1 request (avoid rate limits)
- ✅ **Logic Fallback** - `recommendFromLpers()` + `recommendFromPriceAction()`
- ✅ **Event-Driven** - Listen `data:ready`, emit `scout:complete`
- ✅ **Structured Output** - Score 0-10, strategy type, bin step, reasoning, risk factors
- ✅ **Validation** - Validate LLM JSON output dengan fallback logic

### Rate Limits (Groq Free Tier)

- **Tokens per minute:** 10,000
- **Requests per minute:** 60
- **Max tokens per request:** 2,000
- **Strategy:** Batch analysis untuk efisiensi

### Testing

- Unit tests: `tests/unit/providers/test-groqClient.js`, `tests/unit/agents/test-scoutAgent-llm.js`
- Integration test: `test-llm-integration.js` ✅ PASSED (2026-03-30)

### Output Format

```json
{
  "pool_address": "...",
  "token_symbol": "SOL",
  "score": 8.5,
  "strategy": {
    "type": "bid_ask",
    "bin_step": 100,
    "bin_range": {...},
    "expected_hold_hours": 3.5
  },
  "reasoning": "Top LPers show 68% win rate...",
  "risk_factors": ["Low TVL", "Market cap under $1M"],
  "confidence": "high",
  "recommendation": "ENTER"
}
```

### Scoring Criteria

- **Score 7-10:** ENTER (high confidence)
- **Score 5-6.9:** CONSIDER (moderate confidence)
- **Score < 5:** SKIP (low confidence)

---

## Agent LLM Integration Progress

### Completed (2026-03-30)
- [x] ScoutAgent LLM integration (Kimi K2 via Groq)
  - Created GroqClient provider
  - Batch analysis implementation
  - Logic fallback system
  - Unit + integration tests

### Pending
- [ ] DecisionAgent LLM integration
- [ ] ExecutionAgent LLM integration
- [ ] MemoryAgent LLM integration
- [ ] MotherAgent LLM integration
- [ ] End-to-end pipeline test with all LLM agents

---