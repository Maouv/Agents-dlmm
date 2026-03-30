const LLMProvider = require('./llmProvider');
const logger = require('../utils/logger');

class ModalClient extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.MODAL_API_KEY_1; // Default to key 1
    this.baseURL = config.baseURL || 'https://api.us-west-2.modal.direct/v1';

    if (!this.apiKey) {
      logger.warn('MODAL_API_KEY not set - LLM features will fail');
    }
  }

  async generate(systemPrompt, userPrompt, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug(`Modal API attempt ${attempt}/${retries}`);

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
          const errorMsg = `Modal API error ${response.status}: ${errorData.error?.message || response.statusText}`;

          // Retry on 502, 503, 504 (server errors)
          if ([502, 503, 504].includes(response.status) && attempt < retries) {
            logger.warn(`${errorMsg} - Retrying in ${attempt * 2}s...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            continue;
          }

          throw new Error(errorMsg);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
          throw new Error('Empty response from Modal');
        }

        logger.debug('Modal response received', {
          model: this.model,
          tokens: data.usage
        });

        return content;

      } catch (error) {
        if (attempt === retries) {
          logger.error('Modal API error', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          });
          throw error;
        } else {
          logger.warn(`Modal API attempt ${attempt} failed: ${error.message} - Retrying...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }
  }
}

module.exports = ModalClient;
