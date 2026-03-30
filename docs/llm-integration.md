# LLM Integration

## Overview

ScoutAgent uses Kimi K2 Instruct via Groq API for intelligent pool analysis.

## Setup

1. Get API key from Groq (https://console.groq.com)
2. Add to `.env`:
   ```
   GROQ_API_KEY=your_key_here
   ```

## Architecture

- **Provider**: `src/providers/groqClient.js`
- **Agent**: `src/agents/analysis/scoutAgent.js`
- **Model**: Kimi K2 Instruct (`moonshotai/kimi-k2-instruct`)
- **Endpoint**: `https://api.groq.com/openai/v1`

## Rate Limits

- **Tokens per minute**: 10,000
- **Requests per minute**: 60
- **Max tokens per request**: 2,000

## How It Works

### 1. LLM Analysis (Primary)
ScoutAgent sends structured prompts to GLM-4.7 Flash:
- Pool metrics (TVL, volume, volatility)
- Top LPers data (win rate, ROI, strategies)
- Pool validation status

LLM returns JSON with:
- Score (0-10)
- Strategy type (bid_ask/spot/curve)
- Bin step
- Reasoning
- Risk factors
- Confidence level

### 2. Logic Fallback (Secondary)
If LLM fails, ScoutAgent falls back to logic-based analysis:
- `recommendFromLpers()` - Mirror top LPers patterns
- `recommendFromPriceAction()` - Analyze volatility/volume

## Scoring Criteria

- **Score 7-10**: ENTER (high confidence trade)
- **Score 5-6.9**: CONSIDER (moderate confidence)
- **Score < 5**: SKIP (low confidence)

## Cost Management

- Only analyzes **top 5 pools** per cycle
- ~1500 tokens per analysis
- Logic fallback saves API costs
- Free tier available from Z.ai

## Testing

### Unit Tests
```bash
npm test tests/unit/providers/test-zaiClient.js
npm test tests/unit/agents/test-scoutAgent-llm.js
```

### Integration Test
```bash
node test-llm-integration.js
```

Expected output:
```
ScoutAgent initialized with LLM: glm-4.7-flash
Used LLM analysis for SOL
Recommendation: ENTER
```

## Environment Variables

Required in `.env`:
```
ZAI_API_KEY=your_zai_api_key_here
```

## Troubleshooting

### "ZAI_API_KEY not set"
- Check `.env` file exists
- Verify `ZAI_API_KEY` is set correctly
- Restart application after updating `.env`

### "LLM failed, using logic fallback"
- Check API key validity
- Verify network connectivity
- Check Z.ai service status

### "Invalid JSON from LLM"
- LLM response parsing failed
- Check logs for raw response
- Report issue if persistent
