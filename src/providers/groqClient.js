const LLMProvider = require('./llmProvider');
const logger = require('../utils/logger');

class GroqClient extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY;
    this.baseURL = config.baseURL || 'https://api.groq.com/openai/v1';

    if (!this.apiKey) {
      logger.warn('GROQ_API_KEY not set - LLM features will fail');
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
        throw new Error(`Groq API error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from Groq');
      }

      logger.debug('Groq response received', {
        model: this.model,
        tokens: data.usage,
        tokensPerMinute: 10000,
        requestsPerMinute: 60
      });

      return content;

    } catch (error) {
      logger.error('Groq API error', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      throw error;
    }
  }
}

module.exports = GroqClient;
