const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');
const RiskAgent = require('./riskAgent');
const StrategyAgent = require('./strategyAgent');

class DecisionOrchestrator {
  constructor() {
    this.name = 'DecisionOrchestrator';
    this.riskAgent = new RiskAgent();
    this.strategyAgent = new StrategyAgent();

    logger.info(`${this.name} initialized`);
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on('scout:complete', async (data) => {
      await this.processRecommendations(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  /**
   * Process ScoutAgent recommendations through Risk → Strategy pipeline
   */
  async processRecommendations(data) {
    try {
      logger.info(`${this.name}: Processing ${data.recommendations.length} recommendations`);

      if (!data.recommendations || data.recommendations.length === 0) {
        logger.warn(`${this.name}: No recommendations to process`);
        eventBus.emit('decision:ready', { decisions: [] });
        return;
      }

      const decisions = [];

      for (const rec of data.recommendations) {
        try {
          // Step 1: Risk assessment
          const riskAssessment = await this.riskAgent.assess(rec);

          if (riskAssessment.decision === 'rejected') {
            logger.info(`${this.name}: ${rec.token_symbol} rejected by RiskAgent`);
            continue; // Skip rejected pools
          }

          // Step 2: Strategy formulation
          const strategy = await this.strategyAgent.formulate({
            ...rec,
            risk_assessment: riskAssessment
          });

          // Step 3: Compile final decision
          const decision = this.compileDecision(rec, riskAssessment, strategy);
          decisions.push(decision);

          logger.info(`${this.name}: ${rec.token_symbol} approved with strategy`);

        } catch (error) {
          logger.error(`${this.name}: Error processing ${rec.token_symbol}`, error);
        }
      }

      // Sort by risk-adjusted score
      decisions.sort((a, b) => b.risk_adjusted_score - a.risk_adjusted_score);

      logger.success(`${this.name}: Processing complete, ${decisions.length} decisions`);

      // Emit decisions
      eventBus.emit('decision:ready', {
        decisions,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`${this.name}: Processing failed`, error);
      eventBus.emit('agent:error', {
        agentName: this.name,
        error: error.message
      });
    }
  }

  /**
   * Compile final decision from Scout + Risk + Strategy outputs
   */
  compileDecision(rec, riskAssessment, strategy) {
    // Calculate position size based on risk score
    let positionSize = this.calculatePositionSize(rec, riskAssessment);

    // Calculate confidence score
    const confidence = this.calculateConfidence(rec, riskAssessment, strategy);

    // Calculate risk-adjusted score
    const riskAdjustedScore = this.calculateRiskAdjustedScore(rec, riskAssessment, strategy);

    return {
      pool_address: rec.pool_address,
      token_symbol: rec.token_symbol,
      decision: 'ENTER',
      confidence: confidence,

      // Position parameters
      position_size: positionSize,

      // Entry strategy
      entry_strategy: strategy.entry_strategy,

      // Exit strategy
      exit_strategy: strategy.exit_strategy,

      // DCA config
      dca_config: strategy.dca_config,

      // Risk parameters
      risk_params: {
        stop_loss_percent: strategy.exit_strategy.stop_loss_percent,
        take_profit_percent: strategy.exit_strategy.take_profit_percent,
        max_hold_hours: strategy.exit_strategy.max_hold_hours,
        position_size_usd: positionSize,
        risk_reward_ratio: strategy.exit_strategy.take_profit_percent / strategy.exit_strategy.stop_loss_percent
      },

      // Risk assessment
      risk_assessment: {
        risk_score: riskAssessment.risk_score,
        risk_factors: riskAssessment.risk_factors,
        checks: riskAssessment.checks
      },

      // Strategy insights
      strategy_insights: {
        reasoning: strategy.reasoning,
        lper_based: rec.lper_insights ? true : false
      },

      // Scout data
      lper_insights: rec.lper_insights,
      pool_metrics: rec.pool_metrics,
      scout_reasoning: rec.reasoning,

      // Scores
      scout_score: rec.score,
      risk_score: riskAssessment.risk_score,
      risk_adjusted_score: riskAdjustedScore,

      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(rec, riskAssessment) {
    const minSize = 100;
    const maxSize = 1000;

    // Base size from scout score
    let baseSize = minSize + (maxSize - minSize) * (rec.score / 10);

    // Adjust for risk score (higher risk = smaller position)
    if (riskAssessment.risk_score < 4) {
      baseSize *= 0.5; // High risk - reduce significantly
    } else if (riskAssessment.risk_score < 6) {
      baseSize *= 0.7; // Medium risk - reduce moderately
    } else if (riskAssessment.risk_score >= 8) {
      baseSize *= 1.2; // Low risk - increase
    }

    // Clamp to limits
    baseSize = Math.max(minSize, Math.min(maxSize, baseSize));

    return Math.round(baseSize);
  }

  /**
   * Calculate overall confidence
   */
  calculateConfidence(rec, riskAssessment, strategy) {
    let confidence = 0.5;

    // Scout confidence
    if (rec.confidence === 'high') confidence += 0.15;
    else if (rec.confidence === 'medium') confidence += 0.05;

    // Risk confidence
    confidence += riskAssessment.confidence * 0.3;

    // Strategy confidence
    confidence += strategy.confidence * 0.3;

    // LPers bonus
    if (rec.lper_insights) {
      if (rec.lper_insights.qualified_count >= 3) confidence += 0.1;
      if (rec.lper_insights.avg_win_rate >= 0.7) confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate risk-adjusted score
   */
  calculateRiskAdjustedScore(rec, riskAssessment, strategy) {
    let score = rec.score;

    // Adjust for risk score
    score += (riskAssessment.risk_score - 5) * 0.3;

    // Adjust for LPers quality
    if (rec.lper_insights) {
      score += rec.lper_insights.qualified_count * 0.2;
      if (rec.lper_insights.avg_win_rate >= 0.7) score += 0.5;
    }

    // Adjust for risk factors
    score -= riskAssessment.risk_factors.length * 0.3;

    return Math.max(0, Math.min(10, score));
  }
}

module.exports = new DecisionOrchestrator();
