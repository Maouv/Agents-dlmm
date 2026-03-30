const logger = require('../utils/logger');

/**
 * Generic LLM Provider Interface
 * All providers must implement this interface
 */
class LLMProvider {
  constructor(config) {
    this.model = config.model;
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 2000;
  }

  /**
   * Generate completion - must be implemented by subclasses
   * @param {string} systemPrompt - System context
   * @param {string} userPrompt - User query
   * @returns {Promise<string>} - Generated text
   */
  async generate(systemPrompt, userPrompt) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Generate structured JSON output
   * @param {string} systemPrompt - System context
   * @param {string} userPrompt - User query
   * @returns {Promise<object>} - Parsed JSON object
   */
  async generateJSON(systemPrompt, userPrompt) {
    const response = await this.generate(systemPrompt, userPrompt);

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\n?([\s\S]+?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Failed to parse LLM JSON response', { response, error });
      throw new Error(`Invalid JSON from LLM: ${error.message}`);
    }
  }
}

module.exports = LLMProvider;
