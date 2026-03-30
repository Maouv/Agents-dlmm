const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const stateManager = require('../../core/stateManager');

class DecisionAgent {
  constructor() {
    this.name = 'DecisionAgent';
    this.model = 'glm-5';
    this.provider = 'modal';
    this.temperature = 0.2; // Low temperature for consistent decisions

    // Risk parameters
    this.maxPositionSize = 1000; // USD
    this.minPositionSize = 100; // USD
    this.maxTVLExposure = 0.1; // Max 10% of pool TVL
    this.maxDailyLoss = 0.05; // 5% daily loss limit

    logger.info(`${this.name} initialized`);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on('scout:complete', async (data) => {
      await this.evaluate(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  /**
   * Evaluate Scout recommendations and make final decision
   */
  async evaluate(data) {
    try {
      logger.info(`${this.name}: Evaluating ${data.recommendations.length} recommendations`);

      if (!data.recommendations || data.recommendations.length === 0) {
        logger.warn(`${this.name}: No recommendations to evaluate`);
        eventBus.emit('decision:ready', { decisions: [] });
        return;
      }

      const decisions = [];

      for (const rec of data.recommendations) {
        try {
          const decision = await this.evaluateRecommendation(rec);
          if (decision) {
            decisions.push(decision);
          }
        } catch (error) {
          logger.error(`${this.name}: Error evaluating ${rec.pool_address}`, error);
        }
      }

      // Sort by risk-adjusted score
      decisions.sort((a, b) => b.risk_adjusted_score - a.risk_adjusted_score);

      logger.success(`${this.name}: Evaluation complete, ${decisions.length} decisions`);

      // Emit decisions
      eventBus.emit('decision:ready', {
        decisions,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`${this.name}: Evaluation failed`, error);
      eventBus.emit('agent:error', {
        agentName: this.name,
        error: error.message
      });
    }
  }

  /**
   * Evaluate single recommendation
   */
  async evaluateRecommendation(rec) {
    logger.debug(`${this.name}: Evaluating ${rec.token_symbol} (score: ${rec.score})`);

    // 1. Check recommendation level
    if (rec.recommendation === 'SKIP') {
      logger.debug(`${this.name}: Skipping ${rec.token_symbol} - Scout recommendation`);
      return null;
    }

    // 2. Risk checks
    const riskCheck = this.performRiskChecks(rec);
    if (!riskCheck.passed) {
      logger.warn(`${this.name}: Risk check failed for ${rec.token_symbol}: ${riskCheck.reason}`);
      return null;
    }

    // 3. Position sizing
    const positionSize = this.calculatePositionSize(rec, riskCheck);

    // 4. Risk parameters
    const riskParams = this.calculateRiskParameters(rec, positionSize);

    // 5. Final decision
    const finalDecision = rec.score >= 7 ? 'ENTER' : rec.score >= 5 ? 'CONSIDER' : 'SKIP';

    if (finalDecision === 'SKIP') {
      return null;
    }

    // 6. Calculate risk-adjusted score
    const riskAdjustedScore = this.calculateRiskAdjustedScore(rec, riskCheck);

    return {
      pool_address: rec.pool_address,
      token_symbol: rec.token_symbol,
      decision: finalDecision,
      confidence: this.calculateConfidence(rec, riskCheck),
      position_size: positionSize,
      risk_params: riskParams,
      strategy: rec.strategy,
      lper_insights: rec.lper_insights,
      pool_metrics: rec.pool_metrics,
      reasoning: rec.reasoning,
      risk_checks: riskCheck,
      risk_adjusted_score: riskAdjustedScore,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Perform risk checks
   */
  performRiskChecks(rec) {
    const checks = {
      tvl: true,
      volume: true,
      market_cap: true,
      lper_quality: true,
      pool_valid: true
    };

    const warnings = [];
    let passed = true;

    // TVL check
    if (rec.pool_metrics.tvl < 10000) {
      checks.tvl = false;
      warnings.push('TVL too low (< $10k)');
      passed = false;
    } else if (rec.pool_metrics.tvl > 100000) {
      warnings.push('High TVL - larger position possible');
    }

    // Volume check
    if (rec.pool_metrics.volatility > 3.0) {
      warnings.push('Extreme volatility - reduce position size');
    }

    // Market cap check
    if (rec.pool_metrics.market_cap < 100000) {
      warnings.push('Low market cap - high risk');
    }

    // LPers quality check
    if (rec.lper_insights) {
      if (rec.lper_insights.avg_win_rate < 0.55) {
        checks.lper_quality = false;
        warnings.push('LPers win rate below 55%');
        passed = false;
      }
    }

    // Pool validation
    if (!rec.pool_validation || !rec.pool_validation.isValid) {
      checks.pool_valid = false;
      warnings.push('Pool validation failed');
      passed = false;
    }

    return {
      passed,
      checks,
      warnings,
      reason: passed ? null : warnings.join('; ')
    };
  }

  /**
   * Calculate position size
   */
  calculatePositionSize(rec, riskCheck) {
    let baseSize = this.minPositionSize;

    // Adjust based on score
    if (rec.score >= 8) {
      baseSize = this.maxPositionSize * 0.8; // $800
    } else if (rec.score >= 7) {
      baseSize = this.maxPositionSize * 0.6; // $600
    } else if (rec.score >= 6) {
      baseSize = this.maxPositionSize * 0.4; // $400
    } else {
      baseSize = this.maxPositionSize * 0.2; // $200
    }

    // Adjust based on LPers confidence
    if (rec.lper_insights) {
      if (rec.lper_insights.confidence === 'high') {
        baseSize *= 1.2;
      } else if (rec.lper_insights.confidence === 'medium') {
        baseSize *= 1.0;
      } else {
        baseSize *= 0.8;
      }
    }

    // Adjust based on TVL
    const maxTVLPosition = rec.pool_metrics.tvl * this.maxTVLExposure;
    baseSize = Math.min(baseSize, maxTVLPosition);

    // Adjust based on volatility
    if (rec.pool_metrics.volatility > 2.5) {
      baseSize *= 0.6; // Reduce position on high volatility
    } else if (rec.pool_metrics.volatility < 1.5) {
      baseSize *= 1.1; // Slightly increase on low volatility
    }

    // Clamp to limits
    baseSize = Math.max(this.minPositionSize, Math.min(this.maxPositionSize, baseSize));

    return Math.round(baseSize);
  }

  /**
   * Calculate risk parameters
   */
  calculateRiskParameters(rec, positionSize) {
    const volatility = rec.pool_metrics.volatility;

    // Stop loss based on volatility
    let stopLossPercent;
    if (volatility < 1.5) {
      stopLossPercent = 0.05; // 5%
    } else if (volatility < 2.0) {
      stopLossPercent = 0.08; // 8%
    } else if (volatility < 2.5) {
      stopLossPercent = 0.12; // 12%
    } else {
      stopLossPercent = 0.15; // 15%
    }

    // Take profit based on LPers avg ROI
    let takeProfitPercent;
    if (rec.lper_insights && rec.lper_insights.avg_roi) {
      takeProfitPercent = Math.min(rec.lper_insights.avg_roi * 1.5, 0.25); // Max 25%
    } else {
      takeProfitPercent = volatility < 2.0 ? 0.12 : 0.18;
    }

    // Max hold time from strategy
    const maxHoldHours = rec.strategy.expected_hold_hours * 1.5;

    return {
      stop_loss_percent: stopLossPercent,
      take_profit_percent: takeProfitPercent,
      max_hold_hours: maxHoldHours,
      position_size_usd: positionSize,
      risk_reward_ratio: takeProfitPercent / stopLossPercent
    };
  }

  /**
   * Calculate confidence level
   */
  calculateConfidence(rec, riskCheck) {
    let confidence = 0.5; // Base confidence

    // Adjust for LPers data
    if (rec.lper_insights) {
      confidence += 0.2;
      if (rec.lper_insights.qualified_count >= 3) confidence += 0.1;
      if (rec.lper_insights.avg_win_rate >= 0.7) confidence += 0.1;
    }

    // Adjust for risk checks
    const checkCount = Object.values(riskCheck.checks).filter(v => v).length;
    confidence += (checkCount / 5) * 0.2;

    // Adjust for score
    if (rec.score >= 8) confidence += 0.1;
    else if (rec.score >= 7) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate risk-adjusted score
   */
  calculateRiskAdjustedScore(rec, riskCheck) {
    let adjustedScore = rec.score;

    // Penalize for warnings
    adjustedScore -= riskCheck.warnings.length * 0.5;

    // Reward for LPers data
    if (rec.lper_insights) {
      adjustedScore += rec.lper_insights.qualified_count * 0.3;
    }

    // Adjust for risk-reward ratio
    const riskReward = rec.pool_metrics.fee_tvl_ratio;
    if (riskReward > 0.15) {
      adjustedScore += 0.5;
    }

    return Math.max(0, Math.min(10, adjustedScore));
  }
}

module.exports = new DecisionAgent();
