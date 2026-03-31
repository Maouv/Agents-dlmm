/**
 * Shared prompt templates for Decision Agents
 */

const RISK_PROMPTS = {
  system: `You are a JSON API. Return ONLY JSON. NO explanation. NO analysis. NO markdown. Start with { end with }

Example response:
{"decision":"approved","risk_score":7.5,"risk_factors":[],"confidence":0.8,"reasoning":"TVL and win rate acceptable","checks":{"tvl":true,"volume":true,"market_cap":true,"lper_quality":true,"pool_valid":true}}

RULES:
- APPROVE if TVL ≥ $10k AND win rate ≥ 55% AND pool valid
- REJECT otherwise
- Return JSON immediately, do not explain

Now return JSON for this pool:`,

  buildUserPrompt: (rec) => {
    return `Assess risk for this DLMM pool:

POOL DATA:
- Symbol: ${rec.token_symbol}
- Pool Address: ${rec.pool_address}
- Scout Score: ${rec.score}

METRICS:
- TVL: $${rec.pool_metrics?.tvl?.toLocaleString() || 'N/A'}
- 24h Volume: $${rec.pool_metrics?.volume_24h?.toLocaleString() || 'N/A'}
- Market Cap: $${rec.pool_metrics?.market_cap?.toLocaleString() || 'N/A'}
- Volatility: ${rec.pool_metrics?.volatility?.toFixed(2) || 'N/A'}
- Fee/TVL Ratio: ${rec.pool_metrics?.fee_tvl_ratio?.toFixed(3) || 'N/A'}

${rec.lper_insights ? `
TOP LPERS DATA:
- Qualified LPers: ${rec.lper_insights.qualified_count}
- Avg Win Rate: ${(rec.lper_insights.avg_win_rate * 100).toFixed(1)}%
- Avg ROI: ${(rec.lper_insights.avg_roi * 100).toFixed(1)}%
- Confidence: ${rec.lper_insights.confidence}
` : 'NO LPERS DATA AVAILABLE'}

POOL VALIDATION:
- Valid: ${rec.pool_validation?.isValid ? 'Yes' : 'No'}
- Active Bin: ${rec.pool_validation?.active_bin_id || 'N/A'}
- Total Bins: ${rec.pool_validation?.total_bins || 'N/A'}

Return JSON with this exact structure:
{
  "decision": "<approved|rejected>",
  "risk_score": <number 0-10>,
  "risk_factors": ["<array of risk concerns>"],
  "confidence": <number 0-1>,
  "reasoning": "<string explaining decision>",
  "checks": {
    "tvl": <boolean>,
    "volume": <boolean>,
    "market_cap": <boolean>,
    "lper_quality": <boolean>,
    "pool_valid": <boolean>
  }
}`;
  }
};

const STRATEGY_PROMPTS = {
  system: `You are a JSON API. Return ONLY JSON. NO explanation. NO analysis. NO markdown. Start with { end with }

Example response:
{"entry_strategy":{"strategy_type":"bid_ask","price_target":"current","bin_step":100,"position_size_usd":500,"entry_trigger":"immediate"},"exit_strategy":{"stop_loss_percent":0.08,"take_profit_percent":0.18,"max_hold_hours":5.25,"trailing_stop":true,"exit_conditions":["take_profit_hit","stop_loss_hit"]},"dca_config":{"enabled":true,"triggers":[{"price_drop_percent":10,"position_multiplier":0.6}],"max_entries":3},"confidence":0.8,"reasoning":"Copy LPers strategy"}

RULES:
- Copy top LPers setup exactly
- SL: 5% if win_rate ≥ 70%, else 8%
- TP: LPers avg_roi × 1.5 (max 25%)
- Hold time: LPers avg × 1.5
- Return JSON immediately, do not explain

Now return JSON for this pool:`,

  buildUserPrompt: (approved) => {
    return `Formulate strategy for this approved pool:

POOL DATA:
- Symbol: ${approved.token_symbol}
- Pool Address: ${approved.pool_address}
- Scout Score: ${approved.score}
- Risk Approved: Yes

METRICS:
- TVL: $${approved.pool_metrics?.tvl?.toLocaleString() || 'N/A'}
- Volatility: ${approved.pool_metrics?.volatility?.toFixed(2) || 'N/A'}
- Fee/TVL Ratio: ${approved.pool_metrics?.fee_tvl_ratio?.toFixed(3) || 'N/A'}

${approved.lper_insights ? `
TOP LPERS DATA (COPY THEIR SETUP):
- Qualified LPers: ${approved.lper_insights.qualified_count}
- Avg Win Rate: ${(approved.lper_insights.avg_win_rate * 100).toFixed(1)}%
- Avg ROI: ${(approved.lper_insights.avg_roi * 100).toFixed(1)}%
- Preferred Strategy: ${approved.lper_insights.preferred_strategy}
- Preferred Bin Step: ${approved.lper_insights.preferred_bin_step}
- Avg Hold Time: ${approved.lper_insights.avg_hold_hours?.toFixed(1)}h
- Confidence: ${approved.lper_insights.confidence}
` : 'NO LPERS DATA - Use volatility-based strategy'}

POOL VALIDATION:
- Active Bin: ${approved.pool_validation?.active_bin_id || 25}
- Total Bins: ${approved.pool_validation?.total_bins || 50}

Return JSON with this exact structure:
{
  "entry_strategy": {
    "strategy_type": "<bid_ask|spot|curve>",
    "price_target": "<current|bottom|dip>",
    "bin_step": <number>,
    "position_size_usd": <number>,
    "entry_trigger": "<immediate|on_dip|on_breakout>"
  },
  "exit_strategy": {
    "stop_loss_percent": <number>,
    "take_profit_percent": <number>,
    "max_hold_hours": <number>,
    "trailing_stop": <boolean>,
    "exit_conditions": ["<array of exit conditions>"]
  },
  "dca_config": {
    "enabled": <boolean>,
    "triggers": [
      {"price_drop_percent": 10, "position_multiplier": 0.6},
      {"price_drop_percent": 20, "position_multiplier": 0.6}
    ],
    "max_entries": 3
  },
  "confidence": <number 0-1>,
  "reasoning": "<string explaining strategy choices>"
}`;
  }
};

module.exports = {
  RISK_PROMPTS,
  STRATEGY_PROMPTS
};
