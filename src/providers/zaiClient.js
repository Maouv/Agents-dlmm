const LLMProvider = require('./llmProvider');
const logger = require('../utils/logger');

class ZaiClient extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.ZAI_API_KEY;
    this.baseURL = config.baseURL || 'https://api.z.ai/api/paas/v4';

    if (!this.apiKey) {
      logger.warn('ZAI_API_KEY not set - LLM features will fail');
    }
  }

  async generate(systemPrompt, userPrompt) {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Z.ai API error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from Z.ai');
      }

      logger.debug('Z.ai response received', { model: this.model, tokens: data.usage });

      return content;

    } catch (error) {
      logger.error('Z.ai API error', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      throw error;
    }
  }
}

module.exports = ZaiClient;
