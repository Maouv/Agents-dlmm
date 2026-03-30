const logger = require('../../utils/logger');
const ModalClient = require('../../providers/modalClient');
const { RISK_PROMPTS } = require('./prompts');

class RiskAgent {
  constructor() {
    this.name = 'RiskAgent';
    this.model = 'zai-org/GLM-5-FP8';
    this.provider = 'modal';
    this.temperature = 0.2; // Low temperature for consistent risk decisions

    // Initialize LLM client with Modal API key 2
    this.llmClient = new ModalClient({
      model: this.model,
      temperature: this.temperature,
      maxTokens: 1000,
      apiKey: process.env.MODAL_API_KEY_2
    });

    logger.info(`${this.name} initialized with LLM: ${this.model} (Modal key 2)`);
  }

  /**
   * Assess risk for a pool recommendation
   * @param {Object} rec - ScoutAgent recommendation
   * @returns {Object} - Risk assessment with decision, score, factors
   */
  async assess(rec) {
    try {
      logger.info(`${this.name}: Assessing ${rec.token_symbol}`);

      // Try LLM-based risk assessment
      try {
        const assessment = await this.assessWithLLM(rec);
        logger.info(`${this.name}: LLM risk assessment complete`);
        return assessment;
      } catch (llmError) {
        logger.warn(`${this.name}: LLM failed, using logic fallback`, llmError.message);
        return this.assessWithLogic(rec);
      }

    } catch (error) {
      logger.error(`${this.name}: Risk assessment failed`, error);
      throw error;
    }
  }

  /**
   * Risk assessment using LLM
   */
  async assessWithLLM(rec) {
    const systemPrompt = RISK_PROMPTS.system;
    const userPrompt = RISK_PROMPTS.buildUserPrompt(rec);
    const result = await this.llmClient.generateJSON(systemPrompt, userPrompt);

    // Validate LLM response
    if (!['approved', 'rejected'].includes(result.decision)) {
      throw new Error('Invalid decision from LLM');
    }

    if (typeof result.risk_score !== 'number' || result.risk_score < 0 || result.risk_score > 10) {
      throw new Error('Invalid risk score from LLM');
    }

    return {
      decision: result.decision,
      risk_score: result.risk_score,
      risk_factors: result.risk_factors || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning,
      checks: result.checks || {}
    };
  }

  /**
   * Risk assessment using logic (fallback)
   */
  assessWithLogic(rec) {
    const checks = {
      tvl: true,
      volume: true,
      market_cap: true,
      lper_quality: true,
      pool_valid: true
    };

    const riskFactors = [];
    let riskScore = 5; // Start with medium risk

    // TVL check
    if (rec.pool_metrics.tvl < 10000) {
      checks.tvl = false;
      riskFactors.push('Low TVL (< $10k)');
      riskScore -= 2;
    } else if (rec.pool_metrics.tvl > 100000) {
      riskScore += 1; // High TVL = lower risk
    }

    // Volatility check
    if (rec.pool_metrics.volatility > 3.0) {
      riskFactors.push('Extreme volatility (> 3.0)');
      riskScore -= 2;
    } else if (rec.pool_metrics.volatility < 1.5) {
      riskScore += 1; // Low volatility = lower risk
    }

    // Market cap check
    if (rec.pool_metrics.market_cap < 100000) {
      riskFactors.push('Low market cap (< $100k)');
      riskScore -= 1;
    }

    // LPers quality check
    if (rec.lper_insights) {
      if (rec.lper_insights.avg_win_rate < 0.55) {
        checks.lper_quality = false;
        riskFactors.push('Low LPers win rate (< 55%)');
        riskScore -= 2;
      } else if (rec.lper_insights.avg_win_rate >= 0.7) {
        riskScore += 2; // High win rate = lower risk
      }
    }

    // Pool validation
    if (!rec.pool_validation || !rec.pool_validation.isValid) {
      checks.pool_valid = false;
      riskFactors.push('Pool validation failed');
      riskScore -= 3;
    }

    // Normalize risk score to 0-10
    riskScore = Math.max(0, Math.min(10, riskScore));

    // Decision based on risk score
    const decision = riskScore >= 4 && checks.pool_valid ? 'approved' : 'rejected';

    return {
      decision,
      risk_score: riskScore,
      risk_factors: riskFactors,
      confidence: 0.8,
      reasoning: `Risk score ${riskScore.toFixed(1)}/10. ${riskFactors.length > 0 ? riskFactors.join('. ') : 'No major risk factors.'}`,
      checks
    };
  }
}

module.exports = RiskAgent;
