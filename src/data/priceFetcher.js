const logger = require('../utils/logger');

class PriceFetcher {
  constructor() {
    this.name = 'PriceFetcher';
    this.baseUrl = 'https://api.dexscreener.com/latest';

    logger.info(`${this.name} initialized`);
  }

  /**
   * Fetch token price and metadata from Dexscreener
   * Docs: https://docs.dexscreener.com/api/reference
   */
  async fetchTokenPrice(tokenAddress) {
    try {
      logger.debug(`${this.name}: Fetching price for token ${tokenAddress}`);

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
        logger.warn(`${this.name}: No pairs found for token ${tokenAddress}`);
        return null;
      }

      // Get the main pair (usually highest liquidity)
      const mainPair = data.pairs.sort((a, b) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];

      return {
        token_address: tokenAddress,
        token_symbol: mainPair.baseToken?.symbol || 'UNKNOWN',
        price_usd: parseFloat(mainPair.priceUsd || 0),
        price_native: parseFloat(mainPair.priceNative || 0),
        price_change_24h: parseFloat(mainPair.priceChange?.h24 || 0),
        price_change_6h: parseFloat(mainPair.priceChange?.h6 || 0),
        volume_24h: parseFloat(mainPair.volume?.h24 || 0),
        liquidity_usd: parseFloat(mainPair.liquidity?.usd || 0),
        market_cap: parseFloat(mainPair.fdv || 0),
        pair_address: mainPair.pairAddress,
        txns_24h: (mainPair.txns?.h24?.buys || 0) + (mainPair.txns?.h24?.sells || 0)
      };

    } catch (error) {
      logger.error(`${this.name}: Error fetching price for ${tokenAddress}`, error);
      return null;
    }
  }

  /**
   * Fetch multiple token prices in batch
   */
  async fetchMultiplePrices(tokenAddresses) {
    logger.info(`${this.name}: Fetching prices for ${tokenAddresses.length} tokens`);

    const results = [];

    // Dexscreener can handle multiple tokens per request, but let's batch
    // to avoid rate limiting
    const batchSize = 5;
    const batches = [];

    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      batches.push(tokenAddresses.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const promises = batch.map(addr => this.fetchTokenPrice(addr));
      const batchResults = await Promise.allSettled(promises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      // Small delay between batches to avoid rate limiting
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    logger.success(`${this.name}: Fetched ${results.length} token prices`);

    return results;
  }

  /**
   * Track ATH and bottom prices
   * This should be called periodically to update price history
   */
  async trackPriceHistory(tokenAddress, stateManager) {
    try {
      const priceData = await this.fetchTokenPrice(tokenAddress);

      if (!priceData) {
        return null;
      }

      // Get current ATH and bottom from database
      // For now, we'll use the price as both ATH and bottom
      // Real implementation will track these over time

      const priceHistory = {
        pool_address: priceData.pair_address,
        price: priceData.price_usd,
        ath_price: priceData.price_usd, // TODO: track actual ATH
        bottom_price: priceData.price_usd // TODO: track actual bottom
      };

      // Save to database
      stateManager.addPriceHistory(priceHistory);

      return priceHistory;

    } catch (error) {
      logger.error(`${this.name}: Error tracking price history`, error);
      return null;
    }
  }

  /**
   * Calculate price drop percentage from ATH
   */
  calculateDropFromATH(currentPrice, athPrice) {
    if (athPrice <= 0) return 0;
    return ((athPrice - currentPrice) / athPrice) * 100;
  }

  /**
   * Calculate price recovery percentage from bottom
   */
  calculateRecoveryFromBottom(currentPrice, bottomPrice) {
    if (bottomPrice <= 0) return 0;
    return ((currentPrice - bottomPrice) / bottomPrice) * 100;
  }
}

module.exports = new PriceFetcher();
