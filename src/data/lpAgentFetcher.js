const logger = require('../utils/logger');

class LpAgentFetcher {
  constructor() {
    this.name = 'LpAgentFetcher';
    this.baseUrl = 'https://api.lpagent.io/open-api/v1';
    this.apiKey = process.env.LP_AGENT_API_KEY;

    // Rate limiting: 5 RPM = 1 request per 12 seconds
    this.rateLimit = {
      maxRequestsPerMinute: 5,
      requestInterval: 12000, // 12 seconds between requests
      lastRequestTime: 0,
      requestCount: 0,
      requestCountReset: Date.now()
    };

    logger.info(`${this.name} initialized (rate limit: ${this.rateLimit.maxRequestsPerMinute} RPM)`);
  }

  /**
   * Rate limiter - wait before making next request
   */
  async waitForRateLimit() {
    const now = Date.now();

    // Reset counter every minute
    if (now - this.rateLimit.requestCountReset >= 60000) {
      this.rateLimit.requestCount = 0;
      this.rateLimit.requestCountReset = now;
    }

    // Check if we've hit rate limit
    if (this.rateLimit.requestCount >= this.rateLimit.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.rateLimit.requestCountReset);
      logger.warn(`${this.name}: Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimit.requestCount = 0;
      this.rateLimit.requestCountReset = Date.now();
    }

    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.rateLimit.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimit.requestInterval) {
      const waitTime = this.rateLimit.requestInterval - timeSinceLastRequest;
      logger.debug(`${this.name}: Waiting ${Math.ceil(waitTime/1000)}s before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.rateLimit.lastRequestTime = Date.now();
    this.rateLimit.requestCount++;
  }

  /**
   * Discover pools with quality metrics
   * Docs: https://docs.lpagent.io/api-reference
   */
  async discoverPools(params = {}) {
    try {
      logger.info(`${this.name}: Discovering pools...`);

      const queryParams = new URLSearchParams({
        sortBy: params.sortBy || 'fee_tvl_ratio',
        min_organic_score: params.minOrganicScore || 60,
        min_age_hr: params.minAgeHr || 3,
        max_age_hr: params.maxAgeHr || 168, // 7 days
        min_24h_vol: params.min24hVol || 5000,
        limit: params.limit || 50
      });

      const response = await fetch(`${this.baseUrl}/pools/discover?${queryParams}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`LP Agent API error: ${response.status}`);
      }

      const data = await response.json();

      logger.success(`${this.name}: Discovered ${data.data?.length || 0} pools`);

      return data.data || [];

    } catch (error) {
      logger.error(`${this.name}: Error discovering pools`, error);
      throw error;
    }
  }

  /**
   * Get top LPers for a pool
   * Returns: avg_age_hour, win_rate, roi, total_fee, total_pnl, fee_percent, apr
   */
  async getTopLpers(poolId, limit = 5) {
    try {
      // Check API key first
      if (!this.apiKey) {
        logger.warn(`${this.name}: LP_AGENT_API_KEY not configured, skipping top LPers fetch`);
        return [];
      }

      // Wait for rate limit
      await this.waitForRateLimit();

      logger.debug(`${this.name}: Fetching top LPers for pool ${poolId}`);

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        order_by: 'roi',
        sort_order: 'desc'
      });

      const url = `${this.baseUrl}/pools/${poolId}/top-lpers?${queryParams}`;

      logger.debug(`${this.name}: Request URL: ${url}`);
      logger.debug(`${this.name}: API Key present: ${this.apiKey ? 'YES' : 'NO'}`);
      logger.debug(`${this.name}: API Key length: ${this.apiKey?.length || 0}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': this.apiKey
        }
      });

      logger.debug(`${this.name}: Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unable to read response body');
        logger.error(`${this.name}: API error ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          body: errorBody.substring(0, 200),
          poolId: poolId
        });

        if (response.status === 401) {
          logger.error(`${this.name}: Unauthorized - check LP_AGENT_API_KEY is valid`);
        } else if (response.status === 404) {
          logger.warn(`${this.name}: Pool ${poolId} not found in LP Agent database`);
        } else if (response.status === 429) {
          logger.warn(`${this.name}: Rate limit exceeded for LP Agent API`);
        }

        return [];
      }

      const data = await response.json();

      const lpers = data.data || [];

      logger.debug(`${this.name}: Fetched ${lpers.length} top LPers for pool ${poolId}`);

      return lpers;

    } catch (error) {
      logger.error(`${this.name}: Error fetching top LPers for ${poolId}`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Analyze top LPers patterns
   * Filter: win_rate ≥ 60% and ≥ 3 positions
   */
  analyzeLperPatterns(topLpers) {
    if (!topLpers || topLpers.length === 0) {
      return null;
    }

    // Filter qualified LPers (win_rate ≥ 60%, at least 3 positions implied by data)
    const qualifiedLpers = topLpers.filter(lper => {
      const winRate = lper.win_rate || 0;
      // Win rate might be percentage (60) or decimal (0.6)
      const normalizedWinRate = winRate > 1 ? winRate / 100 : winRate;
      return normalizedWinRate >= 0.6;
    });

    if (qualifiedLpers.length === 0) {
      logger.warn('No qualified LPers found (win_rate < 60%)');
      return null;
    }

    // Calculate averages
    const avgHoldHours = qualifiedLpers.reduce((sum, l) => sum + (l.avg_age_hour || 0), 0) / qualifiedLpers.length;
    const avgWinRate = qualifiedLpers.reduce((sum, l) => {
      const wr = l.win_rate > 1 ? l.win_rate / 100 : l.win_rate;
      return sum + wr;
    }, 0) / qualifiedLpers.length;
    const avgRoi = qualifiedLpers.reduce((sum, l) => sum + (l.roi || 0), 0) / qualifiedLpers.length;
    const avgApr = qualifiedLpers.reduce((sum, l) => sum + (l.apr || 0), 0) / qualifiedLpers.length;

    // Determine preferred strategy (this would need more detailed data in practice)
    // For now, infer from ROI and hold time
    let preferredStrategy = 'bid_ask'; // Default
    if (avgHoldHours < 2) {
      preferredStrategy = 'bid_ask'; // Short hold = concentrated
    } else if (avgHoldHours > 6) {
      preferredStrategy = 'spot'; // Long hold = single sided
    }

    // Estimate bin_step (would need actual position data from LPers)
    // For now, use heuristics
    let preferredBinStep = 100; // Default
    if (avgApr > 100) {
      preferredBinStep = 50; // High APR = tighter bins
    } else if (avgApr < 50) {
      preferredBinStep = 125; // Low APR = wider bins
    }

    return {
      qualified_count: qualifiedLpers.length,
      avg_hold_hours: avgHoldHours,
      avg_win_rate: avgWinRate,
      avg_roi: avgRoi,
      avg_apr: avgApr,
      preferred_strategy: preferredStrategy,
      preferred_bin_step: preferredBinStep,
      confidence: qualifiedLpers.length >= 3 ? 'high' : 'medium'
    };
  }

  /**
   * Get pool details with organic score
   */
  async getPoolDetails(poolId) {
    try {
      logger.debug(`${this.name}: Fetching pool details for ${poolId}`);

      const response = await fetch(`${this.baseUrl}/pools/${poolId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`LP Agent API error: ${response.status}`);
      }

      const data = await response.json();

      return data.data || null;

    } catch (error) {
      logger.error(`${this.name}: Error fetching pool details`, error);
      return null;
    }
  }
}

module.exports = new LpAgentFetcher();
