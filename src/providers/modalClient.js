const LLMProvider = require('./llmProvider');
const logger = require('../utils/logger');

class ModalClient extends LLMProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.MODAL_API_KEY_1; // Default to key 1
    this.baseURL = config.baseURL || 'https://api.us-west-2.modal.direct/v1';
    this.warmedUp = false;

    if (!this.apiKey) {
      logger.warn('MODAL_API_KEY not set - LLM features will fail');
    }
  }

  /**
   * Warm-up Modal container with ping request
   * Helps avoid 502 errors from cold starts
   */
  async warmup() {
    if (this.warmedUp) return;

    try {
      logger.debug('Warming up Modal container...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for warmup

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          temperature: 0.1,
          max_tokens: 5
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.debug('Modal container warmed up successfully');
        this.warmedUp = true;
      } else {
        logger.warn('Modal warmup failed (non-critical)', { status: response.status });
      }
    } catch (error) {
      logger.warn('Modal warmup error (non-critical)', { message: error.message });
      // Don't throw - warmup failure is not critical
    }
  }

  async generate(systemPrompt, userPrompt, retries = 5) {
    // Warm-up container before main request
    await this.warmup();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug(`Modal API attempt ${attempt}/${retries}`);

        // Create AbortController for timeout (180s for GLM-5)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

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
            max_tokens: this.maxTokens,
            response_format: { type: "json_object" } // Force JSON output
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId); // Clear timeout if request completes

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = `Modal API error ${response.status}: ${errorData.error?.message || response.statusText}`;

          // Retry on 502, 503, 504 (server errors) with exponential backoff
          if ([502, 503, 504].includes(response.status) && attempt < retries) {
            const delay = Math.pow(2, attempt) * 2500; // 5s, 10s, 20s, 40s
            logger.warn(`${errorMsg} - Retrying in ${delay/1000}s (attempt ${attempt}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(errorMsg);
        }

        const data = await response.json();
        const message = data.choices[0]?.message;

        // GLM-5 returns content in either 'content' or 'reasoning_content'
        const content = message?.content || message?.reasoning_content;

        if (!content) {
          throw new Error('Empty response from Modal');
        }

        logger.debug('Modal response received', {
          model: this.model,
          tokens: data.usage,
          hasReasoning: !!message?.reasoning_content
        });

        return content;

      } catch (error) {
        // Handle timeout/abort errors
        if (error.name === 'AbortError') {
          const timeoutError = new Error('Modal API request timeout (180s)');
          if (attempt === retries) {
            logger.error('Modal API timeout', { attempt });
            throw timeoutError;
          } else {
            logger.warn(`Modal API timeout on attempt ${attempt} - Retrying...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            continue;
          }
        }

        if (attempt === retries) {
          logger.error('Modal API error', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          });
          throw error;
        } else {
          const delay = Math.pow(2, attempt) * 2500; // 5s, 10s, 20s, 40s
          logger.warn(`Modal API attempt ${attempt} failed: ${error.message} - Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
}

module.exports = ModalClient;
