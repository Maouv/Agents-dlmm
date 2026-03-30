const logger = require('../../utils/logger');
const eventBus = require('../../core/eventBus');

class MotherAgent {
  constructor() {
    this.name = 'MotherAgent';
    this.model = 'glm-5';
    this.provider = 'modal';
    this.temperature = 0.1;

    logger.info(`${this.name} initialized`);
    this.setupListeners();
  }

  setupListeners() {
    // Listen for decision completion
    eventBus.on('decision:complete', async (data) => {
      await this.makeDecision(data);
    });

    logger.debug(`${this.name} listeners setup`);
  }

  async makeDecision(decisionData) {
    logger.info(`${this.name}: Making decision`, decisionData);

    try {
      // Phase 1: Simplified logic without LLM
      // TODO: Add LLM integration in Phase 5

      const { risk, strategy } = decisionData;

      // Risk threshold check (≥7.5 = veto)
      if (risk.score >= 7.5) {
        logger.warn(`${this.name}: Risk score too high, REJECT`, { riskScore: risk.score });
        eventBus.emit('mother:decision', {
          action: 'reject',
          reason: 'Risk score above threshold',
          confidence: 0,
          data: decisionData
        });
        return;
      }

      // Confidence check
      const confidence = strategy.confidence || 0;

      if (confidence < 60) {
        logger.info(`${this.name}: Low confidence, REJECT`, { confidence });
        eventBus.emit('mother:decision', {
          action: 'reject',
          reason: 'Low confidence score',
          confidence,
          data: decisionData
        });
      } else if (confidence >= 60 && confidence <= 80) {
        logger.info(`${this.name}: Medium confidence, MANUAL REVIEW`, { confidence });
        eventBus.emit('mother:decision', {
          action: 'review',
          reason: 'Requires manual review',
          confidence,
          data: decisionData
        });
      } else {
        logger.success(`${this.name}: High confidence, APPROVE`, { confidence });
        eventBus.emit('mother:decision', {
          action: 'approve',
          reason: 'High confidence score',
          confidence,
          data: decisionData
        });
      }

    } catch (error) {
      logger.error(`${this.name}: Decision error`, error);
      eventBus.emit('agent:error', {
        agentName: this.name,
        error: error.message
      });
    }
  }
}

module.exports = MotherAgent;
