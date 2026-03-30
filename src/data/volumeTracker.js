const logger = require('../utils/logger');

class VolumeTracker {
  constructor() {
    this.name = 'VolumeTracker';
    this.baseUrl = 'https://api.dexscreener.com/latest';

    logger.info(`${this.name} initialized`);
  }

  /**
   * Fetch volume data for a token
   */
  async fetchVolumeData(tokenAddress) {
    try {
      logger.debug(`${this.name}: Fetching volume for ${tokenAddress}`);

      const response = await fetch(`${this.baseUrl}/dex/tokens/${tokenAddress}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Dexscreener API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      const mainPair = data.pairs.sort((a, b) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];

      // Calculate volume per minute
      const volume24h = parseFloat(mainPair.volume?.h24 || 0);
      const volumePerMinute = volume24h / (24 * 60); // 1440 minutes in 24h

      // Calculate buy/sell ratio
      const buys = mainPair.txns?.h24?.buys || 0;
      const sells = mainPair.txns?.h24?.sells || 0;
      const totalTxns = buys + sells;
      const buyRatio = totalTxns > 0 ? buys / totalTxns : 0;

      return {
        token_address: tokenAddress,
        volume_24h: volume24h,
        volume_1h: parseFloat(mainPair.volume?.h1 || 0),
        volume_per_minute: volumePerMinute,
        txns_24h: totalTxns,
        buys_24h: buys,
        sells_24h: sells,
        buy_ratio: buyRatio,
        liquidity_usd: parseFloat(mainPair.liquidity?.usd || 0)
      };

    } catch (error) {
      logger.error(`${this.name}: Error fetching volume for ${tokenAddress}`, error);
      return null;
    }
  }

  /**
   * Fetch volume for multiple tokens
   */
  async fetchMultipleVolumes(tokenAddresses) {
    logger.info(`${this.name}: Fetching volume for ${tokenAddresses.length} tokens`);

    const results = [];
    const batchSize = 5;

    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const promises = batch.map(addr => this.fetchVolumeData(addr));
      const batchResults = await Promise.allSettled(promises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      if (i + batchSize < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    logger.success(`${this.name}: Fetched ${results.length} volume data points`);

    return results;
  }

  /**
   * Check if volume meets Rug Me criteria
   * Rug Me: min 5k volume per minute
   */
  meetsRugMeCriteria(volumeData) {
    if (!volumeData) return false;

    const meetsMinVolume = volumeData.volume_per_minute >= 5000;
    const hasActivity = volumeData.txns_24h >= 100; // At least 100 txns in 24h

    return meetsMinVolume && hasActivity;
  }
}

module.exports = new VolumeTracker();
