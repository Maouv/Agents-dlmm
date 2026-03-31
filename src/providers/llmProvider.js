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
      // Try 1: Parse directly (for clean JSON responses)
      try {
        return JSON.parse(response);
      } catch (directError) {
        // Not clean JSON, continue to extraction
      }

      // Try 2: Extract from markdown code blocks
      const codeBlockMatch = response.match(/```json\n?([\s\S]+?)\n?```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]);
        } catch (e) {
          // Continue to try 3
        }
      }

      // Try 3: Extract JSON object from anywhere in response
      // This handles GLM-5's tendency to write reasoning text before JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = jsonMatch[0];
          return JSON.parse(extracted);
        } catch (e) {
          // JSON might be truncated, log and throw
          logger.error('Found JSON in response but failed to parse (likely truncated)', {
            extracted: jsonMatch[0].substring(0, 200) + '...',
            error: e.message
          });
        }
      }

      // All attempts failed
      throw new Error('No valid JSON found in response');

    } catch (error) {
      logger.error('Failed to parse LLM JSON response', {
        responsePreview: response.substring(0, 500) + '...',
        error: error.message
      });
      throw new Error(`Invalid JSON from LLM: ${error.message}`);
    }
  }
}

module.exports = LLMProvider;
