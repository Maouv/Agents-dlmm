const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const dlmmSDK = require('../../services/dlmmSDK');
const GroqClient = require('../../providers/groqClient');

class ScoutAgent {
  constructor() {
    this.name = 'ScoutAgent';
    this.model = 'moonshotai/kimi-k2-instruct'; // Kimi K2 via Groq
    this.provider = 'groq';
    this.temperature = 0.3;

    // Initialize LLM client
    this.llmClient = new GroqClient({
      model: this.model,
      temperature: this.temperature,
      maxTokens: 2000
    });

    logger.info(`${this.name} initialized with LLM: ${this.model} (Groq)`);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on('data:ready', async (data) => {
      await this.analyze(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  /**
   * Main analysis method
   * Analyze ALL pools in one LLM call to avoid rate limits
   */
  async analyze(data) {
    try {
      logger.info(`${this.name}: Analyzing ${data.pools.length} candidate pools`);

      if (!data.pools || data.pools.length === 0) {
        logger.warn(`${this.name}: No pools to analyze`);
        eventBus.emit('scout:complete', { recommendations: [] });
        return;
      }

      let recommendations = [];

      // Try LLM analysis for ALL pools at once
      try {
        recommendations = await this.analyzeAllWithLLM(data.pools);
        logger.info(`${this.name}: Used LLM analysis for all pools`);
      } catch (llmError) {
        // Fallback: analyze individually with logic
        logger.warn(`${this.name}: LLM failed, using logic fallback`, llmError.message);

        for (const pool of data.pools) {
          try {
            const recommendation = await this.analyzePoolWithLogic(pool);
            if (recommendation) {
              recommendations.push(recommendation);
            }
          } catch (error) {
            logger.error(`${this.name}: Error analyzing pool ${pool.pool_address}`, error);
          }
        }
      }

      // Sort by score (highest first)
      recommendations.sort((a, b) => b.score - a.score);

      logger.success(`${this.name}: Analysis complete, ${recommendations.length} recommendations`);

      // Emit recommendations
      eventBus.emit('scout:complete', {
        recommendations,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`${this.name}: Analysis failed`, error);
      eventBus.emit('agent:error', {
        agentName: this.name,
        error: error.message
      });
    }
  }

  /**
   * Analyze ALL pools with one LLM call (avoid rate limits)
   */
  async analyzeAllWithLLM(pools) {
    try {
      const { systemPrompt, userPrompt } = this.buildBatchAnalysisPrompt(pools);
      const analyses = await this.llmClient.generateJSON(systemPrompt, userPrompt);

      if (!Array.isArray(analyses)) {
        throw new Error('LLM did not return array');
      }

      const recommendations = [];

      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const analysis = analyses[i];

        if (!analysis) {
          logger.warn(`No analysis for pool ${i}, using logic fallback`);
          const fallback = await this.analyzePoolWithLogic(pool);
          if (fallback) recommendations.push(fallback);
          continue;
        }

        // Validate
        if (typeof analysis.score !== 'number' || analysis.score < 0 || analysis.score > 10) {
          logger.warn(`Invalid score for pool ${i}, using logic fallback`);
          const fallback = await this.analyzePoolWithLogic(pool);
          if (fallback) recommendations.push(fallback);
          continue;
        }

        if (!['bid_ask', 'spot', 'curve'].includes(analysis.strategy_type)) {
          logger.warn(`Invalid strategy for pool ${i}, using logic fallback`);
          const fallback = await this.analyzePoolWithLogic(pool);
          if (fallback) recommendations.push(fallback);
          continue;
        }

        // Build recommendation
        const binRange = dlmmSDK.calculateBinRange({
          activeBinId: pool.pool_validation?.active_bin_id || 25,
          volatility: pool.volatility,
          strategy: analysis.strategy_type,
          binStep: analysis.bin_step
        });

        const hasLpersData = pool.lper_analysis && pool.lper_analysis.qualified_count > 0;

        recommendations.push({
          pool_address: pool.pool_address,
          token_symbol: pool.token_symbol,
          score: analysis.score,
          strategy: {
            type: analysis.strategy_type,
            bin_step: analysis.bin_step,
            bin_range: binRange,
            expected_hold_hours: hasLpersData ? pool.lper_analysis.avg_hold_hours : this.estimateHoldTime(pool.volatility)
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
          pool_validation: pool.pool_validation || { isValid: true, active_bin_id: 25 },
          reasoning: analysis.reasoning,
          risk_factors: analysis.risk_factors || [],
          confidence: analysis.confidence || 'medium',
          recommendation: analysis.score >= 7 ? 'ENTER' : analysis.score >= 5 ? 'CONSIDER' : 'SKIP'
        });
      }

      logger.debug(`${this.name}: LLM batch analysis complete for ${pools.length} pools`);
      return recommendations;

    } catch (error) {
      logger.error(`${this.name}: LLM batch analysis failed`, error);
      throw error;
    }
  }

  /**
   * Build batch prompt for analyzing multiple pools at once
   */
  buildBatchAnalysisPrompt(pools) {
    const systemPrompt = `You are a professional DLMM pool analyst.

Analyze ALL pools and return a JSON ARRAY with recommendations.

SCORING CRITERIA:
- Score 7-10: ENTER (high confidence)
- Score 5-6.9: CONSIDER (moderate)
- Score < 5: SKIP (low confidence)

STRATEGY TYPES:
- bid_ask: Concentrated liquidity (low volatility)
- spot: Single-sided (medium volatility)
- curve: Wide spread (high volatility)

IMPORTANT:
1. PRIORITIZE LPers data over price trends
2. Mirror successful LPers strategies
3. Consider risk factors (TVL, volatility, MC)

OUTPUT: Return ONLY valid JSON array, one object per pool.`;

    let userPrompt = `Analyze ${pools.length} pools. Return JSON array with ${pools.length} objects:\n\n`;

    pools.forEach((pool, idx) => {
      const hasLpersData = pool.lper_analysis && pool.lper_analysis.qualified_count > 0;

      userPrompt += `POOL ${idx + 1}:\n`;
      userPrompt += `- Symbol: ${pool.token_symbol}\n`;
      userPrompt += `- TVL: $${pool.tvl?.toLocaleString() || 'N/A'}\n`;
      userPrompt += `- Volume: $${pool.volume_24h?.toLocaleString() || 'N/A'}\n`;
      userPrompt += `- MC: $${pool.market_cap?.toLocaleString() || 'N/A'}\n`;
      userPrompt += `- Volatility: ${pool.volatility?.toFixed(2) || 'N/A'}\n`;

      if (hasLpersData) {
        userPrompt += `- LPers: ${pool.lper_analysis.qualified_count} qualified, `;
        userPrompt += `${(pool.lper_analysis.avg_win_rate * 100).toFixed(0)}% win rate, `;
        userPrompt += `${(pool.lper_analysis.avg_roi * 100).toFixed(1)}% ROI, `;
        userPrompt += `Strategy: ${pool.lper_analysis.preferred_strategy}\n`;
      }

      userPrompt += `\n`;
    });

    userPrompt += `Return JSON array:\n`;
    userPrompt += `[{"score": <0-10>, "strategy_type": "<bid_ask|spot|curve>", "bin_step": <number>, "reasoning": "<string>", "risk_factors": [], "confidence": "<high|medium|low>"}, ...]`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Analyze pool with logic (fallback)
   */
  async analyzePoolWithLogic(pool) {
    const hasLpersData = pool.lper_analysis && pool.lper_analysis.qualified_count > 0;

    let strategy, reasoning, score;

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
      pool_validation: pool.pool_validation || { isValid: true, active_bin_id: 25 },
      reasoning: reasoning,
      risk_factors: [],
      confidence: 'medium',
      recommendation: score >= 7 ? 'ENTER' : score >= 5 ? 'CONSIDER' : 'SKIP'
    };
  }

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

  /**
   * Recommend strategy based on top LPers behavior
   * PRIORITIZE LPERS over price trends
   */
  recommendFromLpers(pool) {
    const lperAnalysis = pool.lper_analysis;

    // LPers with win_rate >= 60% are considered knowledgeable
    // Follow their setup

    const strategy = {
      type: lperAnalysis.preferred_strategy,
      bin_step: lperAnalysis.preferred_bin_step
    };

    // Score based on LPers quality
    let score = 6; // Base score

    // More qualified LPers = higher confidence
    if (lperAnalysis.qualified_count >= 3) {
      score += 2;
    } else if (lperAnalysis.qualified_count >= 2) {
      score += 1;
    }

    // Higher win rate = higher score
    if (lperAnalysis.avg_win_rate >= 0.7) {
      score += 1;
    }

    // Higher ROI = higher score
    if (lperAnalysis.avg_roi > 0.15) {
      score += 1;
    }

    // Reasoning
    const reasoning = `Mirror top ${lperAnalysis.qualified_count} LPers with ` +
                     `${(lperAnalysis.avg_win_rate * 100).toFixed(0)}% avg win rate, ` +
                     `${(lperAnalysis.avg_roi * 100).toFixed(1)}% avg ROI. ` +
                     `Preferred strategy: ${strategy.type}, bin_step: ${strategy.bin_step}. ` +
                     `Avg hold time: ${lperAnalysis.avg_hold_hours.toFixed(1)}h. ` +
                     `LPers confidence: ${lperAnalysis.confidence}.`;

    return { strategy, reasoning, score: Math.min(score, 10) };
  }

  /**
   * Fallback: Recommend from price action (no LPers data)
   */
  recommendFromPriceAction(pool) {
    let strategy, score = 5;

    // Based on volatility
    if (pool.volatility < 1.5) {
      strategy = {
        type: 'bid_ask',
        bin_step: 100
      };
      score += 1;
    } else if (pool.volatility >= 1.5 && pool.volatility < 2.0) {
      strategy = {
        type: 'bid_ask',
        bin_step: 125
      };
    } else {
      // High volatility
      strategy = {
        type: 'curve',
        bin_step: 150
      };
      score -= 1;
    }

    // Adjust score based on fee/TVL ratio
    if (pool.fee_tvl_ratio > 0.1) {
      score += 1; // High yield potential
    }

    // Adjust score based on volume
    if (pool.volume_per_minute > 10000) {
      score += 1;
    }

    const reasoning = `No qualified LPers data. ` +
                     `Strategy based on volatility (${pool.volatility.toFixed(2)}). ` +
                     `Fee/TVL ratio: ${pool.fee_tvl_ratio.toFixed(3)}. ` +
                     `Volume: $${(pool.volume_per_minute).toFixed(0)}/min. ` +
                     `Lower confidence without LPers data.`;

    return { strategy, reasoning, score: Math.min(score, 10) };
  }

  /**
   * Estimate hold time from volatility
   */
  estimateHoldTime(volatility) {
    if (volatility < 1.5) {
      return 4; // hours
    } else if (volatility < 2.0) {
      return 3;
    } else {
      return 2;
    }
  }
}

module.exports = ScoutAgent;
