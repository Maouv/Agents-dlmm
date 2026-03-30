const logger = require('../../utils/logger');
const ModalClient = require('../../providers/modalClient');
const dlmmSDK = require('../../services/dlmmSDK');

class StrategyAgent {
  constructor() {
    this.name = 'StrategyAgent';
    this.model = 'zai-org/GLM-5-FP8';
    this.provider = 'modal';
    this.temperature = 0.2; // Low temperature for consistent strategies

    // Initialize LLM client with Modal API key 3
    this.llmClient = new ModalClient({
      model: this.model,
      temperature: this.temperature,
      maxTokens: 1500,
      apiKey: process.env.MODAL_API_KEY_3
    });

    logger.info(`${this.name} initialized with LLM: ${this.model} (Modal key 3)`);
  }

  /**
   * Formulate strategy for approved pool
   * @param {Object} approved - RiskAgent approved pool
   * @returns {Object} - Strategy with entry, exit, DCA config
   */
  async formulate(approved) {
    try {
      logger.info(`${this.name}: Formulating strategy for ${approved.token_symbol}`);

      // Try LLM-based strategy
      try {
        const strategy = await this.formulateWithLLM(approved);
        logger.info(`${this.name}: LLM strategy formulation complete`);
        return strategy;
      } catch (llmError) {
        logger.warn(`${this.name}: LLM failed, using logic fallback`, llmError.message);
        return this.formulateWithLogic(approved);
      }

    } catch (error) {
      logger.error(`${this.name}: Strategy formulation failed`, error);
      throw error;
    }
  }

  /**
   * Strategy formulation using LLM
   */
  async formulateWithLLM(approved) {
    const { systemPrompt, userPrompt } = this.buildStrategyPrompt(approved);
    const result = await this.llmClient.generateJSON(systemPrompt, userPrompt);

    // Validate LLM response
    if (!result.entry_strategy || !result.exit_strategy) {
      throw new Error('Missing strategy components from LLM');
    }

    // Calculate bin range based on strategy
    const binRange = dlmmSDK.calculateBinRange({
      activeBinId: approved.pool_validation?.active_bin_id || 25,
      volatility: approved.pool_metrics.volatility,
      strategy: result.entry_strategy.strategy_type || 'bid_ask',
      binStep: result.entry_strategy.bin_step
    });

    return {
      entry_strategy: {
        ...result.entry_strategy,
        bin_range: binRange
      },
      exit_strategy: result.exit_strategy,
      dca_config: result.dca_config || null,
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning
    };
  }

  /**
   * Build strategy formulation prompt
   */
  buildStrategyPrompt(approved) {
    const systemPrompt = `You are a professional DLMM strategy specialist.

Your role: Formulate entry, exit, and DCA strategy based on top LPers behavior.

COPY TOP LPERS STRATEGY:
- Mirror successful LPers' entry points
- Copy their bin step and bin range preferences
- Use their average hold time for exit planning
- Apply their win rate to calculate stop loss/take profit

DCA TRIGGERS:
- Price drops: 10% → DCA 1, 20% → DCA 2, 30% → DCA 3
- Max 3 DCA entries
- Reduce position size per DCA (60% of original)

EXIT CONDITIONS:
- Stop loss: Based on LPers win rate (high win rate = tighter SL)
- Take profit: Based on LPers avg ROI (aim for 1.2x-1.5x their avg)
- Max hold time: 1.5x LPers avg hold time

IMPORTANT:
1. PRIORITIZE LPERS DATA - copy their exact setup
2. If no LPers data, use volatility-based strategy
3. Consider fee/TVL ratio for yield potential
4. Provide clear reasoning for strategy choices

OUTPUT: Return ONLY valid JSON, no markdown formatting.`;

    const userPrompt = `Formulate strategy for this approved pool:

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

    return { systemPrompt, userPrompt };
  }

  /**
   * Strategy formulation using logic (fallback)
   */
  formulateWithLogic(approved) {
    let entryStrategy, exitStrategy, dcaConfig;

    // COPY TOP LPERS STRATEGY
    if (approved.lper_insights && approved.lper_insights.qualified_count > 0) {
      entryStrategy = {
        strategy_type: approved.lper_insights.preferred_strategy,
        price_target: 'current',
        bin_step: approved.lper_insights.preferred_bin_step,
        position_size_usd: 500, // Default, will be adjusted by orchestrator
        entry_trigger: 'immediate'
      };

      // Exit based on LPers data
      const avgROI = approved.lper_insights.avg_roi;
      exitStrategy = {
        stop_loss_percent: approved.lper_insights.avg_win_rate >= 0.7 ? 0.05 : 0.08,
        take_profit_percent: Math.min(avgROI * 1.5, 0.25),
        max_hold_hours: approved.lper_insights.avg_hold_hours * 1.5,
        trailing_stop: true,
        exit_conditions: ['take_profit_hit', 'stop_loss_hit', 'max_hold_time']
      };

      // DCA config
      dcaConfig = {
        enabled: true,
        triggers: [
          { price_drop_percent: 10, position_multiplier: 0.6 },
          { price_drop_percent: 20, position_multiplier: 0.6 }
        ],
        max_entries: 3
      };

    } else {
      // NO LPERS DATA - use volatility-based strategy
      entryStrategy = {
        strategy_type: approved.pool_metrics.volatility < 1.5 ? 'bid_ask' : 'curve',
        price_target: 'current',
        bin_step: approved.pool_metrics.volatility < 1.5 ? 100 : 150,
        position_size_usd: 400,
        entry_trigger: 'immediate'
      };

      exitStrategy = {
        stop_loss_percent: approved.pool_metrics.volatility < 2.0 ? 0.08 : 0.12,
        take_profit_percent: approved.pool_metrics.volatility < 2.0 ? 0.12 : 0.18,
        max_hold_hours: 3,
        trailing_stop: false,
        exit_conditions: ['take_profit_hit', 'stop_loss_hit']
      };

      dcaConfig = {
        enabled: false,
        triggers: [],
        max_entries: 0
      };
    }

    // Calculate bin range
    const binRange = dlmmSDK.calculateBinRange({
      activeBinId: approved.pool_validation?.active_bin_id || 25,
      volatility: approved.pool_metrics.volatility,
      strategy: entryStrategy.strategy_type,
      binStep: entryStrategy.bin_step
    });

    entryStrategy.bin_range = binRange;

    const reasoning = approved.lper_insights
      ? `Copying top ${approved.lper_insights.qualified_count} LPers: ${approved.lper_insights.preferred_strategy} strategy, bin_step ${approved.lper_insights.preferred_bin_step}, targeting ${(approved.lper_insights.avg_roi * 100).toFixed(1)}% ROI.`
      : `No LPers data. Using volatility-based strategy (${approved.pool_metrics.volatility.toFixed(2)}).`;

    return {
      entry_strategy: entryStrategy,
      exit_strategy: exitStrategy,
      dca_config: dcaConfig,
      confidence: approved.lper_insights ? 0.8 : 0.6,
      reasoning
    };
  }
}

module.exports = StrategyAgent;
