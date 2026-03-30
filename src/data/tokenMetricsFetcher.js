const logger = require('../utils/logger');

class TokenMetricsFetcher {
  constructor() {
    this.name = 'TokenMetricsFetcher';
    this.baseUrl = 'https://public-api.solscan.io';

    logger.info(`${this.name} initialized`);
  }

  /**
   * Fetch token metadata including creation time (token age)
   * Solscan API docs: https://pro-api.solscan.io/pro-api-docs/
   */
  async fetchTokenMetadata(tokenAddress) {
    try {
      logger.debug(`${this.name}: Fetching metadata for ${tokenAddress}`);

      const response = await fetch(`${this.baseUrl}/token/meta?tokenAddress=${tokenAddress}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Solscan might require API key for some endpoints
        // Fallback: try alternate endpoint or return null
        logger.warn(`${this.name}: Solscan API returned ${response.status}, using fallback`);

        // Return minimal data without age (will be handled by filtering logic)
        return {
          token_address: tokenAddress,
          age_hours: null,
          age_days: null,
          created_at: null,
          symbol: 'UNKNOWN'
        };
      }

      const data = await response.json();

      // Calculate token age
      let ageHours = null;
      let ageDays = null;

      if (data.creationTime || data.created_at) {
        const createdTimestamp = parseInt(data.creationTime || data.created_at) * 1000; // Convert to ms
        const now = Date.now();
        const ageMs = now - createdTimestamp;

        ageHours = ageMs / (1000 * 60 * 60);
        ageDays = ageHours / 24;
      }

      return {
        token_address: tokenAddress,
        symbol: data.symbol || data.tokenSymbol || 'UNKNOWN',
        name: data.name || data.tokenName || 'Unknown',
        age_hours: ageHours,
        age_days: ageDays,
        created_at: data.creationTime || data.created_at || null,
        supply: data.supply || data.totalSupply || 0,
        decimals: data.decimals || 9
      };

    } catch (error) {
      logger.error(`${this.name}: Error fetching metadata for ${tokenAddress}`, error);

      // Return null on error - will be filtered out
      return {
        token_address: tokenAddress,
        age_hours: null,
        age_days: null,
        created_at: null,
        symbol: 'UNKNOWN'
      };
    }
  }

  /**
   * Fetch metadata for multiple tokens
   */
  async fetchMultipleMetadata(tokenAddresses) {
    logger.info(`${this.name}: Fetching metadata for ${tokenAddresses.length} tokens`);

    const results = [];
    const batchSize = 5;

    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const promises = batch.map(addr => this.fetchTokenMetadata(addr));
      const batchResults = await Promise.allSettled(promises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      if (i + batchSize < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 300)); // Slower for Solscan
      }
    }

    logger.success(`${this.name}: Fetched ${results.length} token metadata`);

    return results;
  }

  /**
   * Check if token age meets Rug Me criteria
   * Rug Me: 3 hours to 7 days
   */
  meetsAgeCriteria(tokenMetadata) {
    if (!tokenMetadata || tokenMetadata.age_hours === null) {
      // If we can't determine age, let it pass
      // Strategy Agent will flag it
      return true;
    }

    const { age_hours, age_days } = tokenMetadata;

    // Between 3 hours and 7 days
    const minHours = 3;
    const maxDays = 7;

    return age_hours >= minHours && age_days <= maxDays;
  }

  /**
   * Alternative: Get token creation time from blockchain data
   * If Solscan API doesn't work
   */
  async getTokenCreationFromRPC(tokenAddress, rpcUrl = 'https://api.mainnet-beta.solana.com') {
    try {
      logger.debug(`${this.name}: Fetching creation time via RPC for ${tokenAddress}`);

      // This would require a Solana RPC client
      // For now, return null - can implement later if needed
      logger.warn(`${this.name}: RPC method not implemented yet`);

      return {
        token_address: tokenAddress,
        age_hours: null,
        created_at: null
      };

    } catch (error) {
      logger.error(`${this.name}: Error fetching creation time via RPC`, error);
      return null;
    }
  }
}

module.exports = new TokenMetricsFetcher();
