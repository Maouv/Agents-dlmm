const logger = require('../utils/logger');
const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');
const poolScanner = require('./poolScanner');
const priceFetcher = require('./priceFetcher');
const volumeTracker = require('./volumeTracker');
const tokenMetricsFetcher = require('./tokenMetricsFetcher');

class DataAggregator {
  constructor() {
    this.name = 'DataAggregator';
    logger.info(`${this.name} initialized`);
  }

  /**
   * Main data aggregation method
   * Fetches all data and filters for Rug Me strategy
   */
  async aggregate() {
    try {
      logger.info(`${this.name}: Starting data aggregation...`);
      const startTime = Date.now();

      // Step 1: Fetch pools from Meteora
      const allPools = await poolScanner.fetchPools();
      logger.info(`${this.name}: Found ${allPools.length} total pools`);

      // Step 2: Initial filter (TVL < 100k)
      const filteredPools = poolScanner.filterPoolsForRugMe(allPools);
      logger.info(`${this.name}: ${filteredPools.length} pools passed initial filter`);

      if (filteredPools.length === 0) {
        logger.warn(`${this.name}: No pools meet criteria`);
        return this.emitEmptyData();
      }

      // Step 3: Get token addresses
      const tokenAddresses = [...new Set(
        filteredPools
          .map(p => p.token_x_address || p.token_address)
          .filter(addr => addr && addr !== 'UNKNOWN')
      )];

      logger.info(`${this.name}: Fetching data for ${tokenAddresses.length} unique tokens`);

      // Step 4: Fetch all data in parallel
      const [prices, volumes, metadata] = await Promise.all([
        priceFetcher.fetchMultiplePrices(tokenAddresses),
        volumeTracker.fetchMultipleVolumes(tokenAddresses),
        tokenMetricsFetcher.fetchMultipleMetadata(tokenAddresses)
      ]);

      logger.info(`${this.name}: Fetched ${prices.length} prices, ${volumes.length} volumes, ${metadata.length} metadata`);

      // Step 5: Combine all data
      const combinedData = this.combineData(filteredPools, prices, volumes, metadata);

      // Step 6: Apply Rug Me filters
      const candidates = this.applyRugMeFilters(combinedData);

      // Step 7: Save to database
      this.saveToDatabase(candidates);

      const duration = Date.now() - startTime;
      logger.success(`${this.name}: Aggregation complete in ${duration}ms`);
      logger.info(`${this.name}: Found ${candidates.length} Rug Me candidates`);

      // Emit data ready event
      const eventData = {
        pools: candidates,
        timestamp: new Date().toISOString(),
        stats: {
          total_pools: allPools.length,
          filtered_pools: filteredPools.length,
          candidates: candidates.length,
          duration_ms: duration
        }
      };

      eventBus.emit('data:ready', eventData);

      return eventData;

    } catch (error) {
      logger.error(`${this.name}: Aggregation failed`, error);
      eventBus.emit('data:error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Combine pool, price, volume, and metadata
   */
  combineData(pools, prices, volumes, metadata) {
    const priceMap = new Map(prices.map(p => [p.token_address, p]));
    const volumeMap = new Map(volumes.map(v => [v.token_address, v]));
    const metadataMap = new Map(metadata.map(m => [m.token_address, m]));

    return pools.map(pool => {
      const tokenAddress = pool.token_x_address || pool.token_address;
      const price = priceMap.get(tokenAddress) || {};
      const volume = volumeMap.get(tokenAddress) || {};
      const meta = metadataMap.get(tokenAddress) || {};

      return {
        // Pool data
        pool_address: pool.pool_address,
        token_address: tokenAddress,
        token_symbol: pool.token_symbol || price.token_symbol || 'UNKNOWN',

        // Pool metrics
        base_fee: pool.base_fee,
        tvl: pool.tvl,
        pool_volume_24h: pool.volume_24h,
        apr: pool.apr,
        bin_step: pool.bin_step,
        number_of_bins: pool.number_of_bins,

        // Price data
        price_usd: price.price_usd || 0,
        price_native: price.price_native || 0,
        price_change_24h: price.price_change_24h || 0,
        market_cap: price.market_cap || 0,
        liquidity_usd: price.liquidity_usd || pool.tvl || 0,

        // Volume data
        volume_24h: volume.volume_24h || 0,
        volume_per_minute: volume.volume_per_minute || 0,
        txns_24h: volume.txns_24h || 0,
        buy_ratio: volume.buy_ratio || 0,

        // Token metadata
        age_hours: meta.age_hours,
        age_days: meta.age_days,
        created_at: meta.created_at,

        // Calculated fields
        price_drop_from_ath: 0, // Will be calculated after tracking ATH
        bottom_price: price.price_usd || 0
      };
    });
  }

  /**
   * Apply Rug Me strategy filters
   */
  applyRugMeFilters(combinedData) {
    logger.info(`${this.name}: Applying Rug Me filters...`);

    return combinedData.filter(data => {
      // Rug Me criteria:
      // - MC > 200k
      // - Volume per minute > 5k
      // - TVL < 100k
      // - Token age: 3h - 7d
      // - Base fee > 0

      const meetsMC = data.market_cap >= 200000;
      const meetsVolume = data.volume_per_minute >= 5000;
      const meetsTVL = data.tvl < 100000 && data.tvl > 0;
      const meetsFee = data.base_fee > 0;

      // Age criteria (if available)
      let meetsAge = true;
      if (data.age_hours !== null) {
        meetsAge = data.age_hours >= 3 && data.age_days <= 7;
      }

      // Log why a pool was filtered out
      if (!meetsMC) logger.debug(`Filtered ${data.token_symbol}: MC ${data.market_cap} < 200k`);
      if (!meetsVolume) logger.debug(`Filtered ${data.token_symbol}: Volume ${data.volume_per_minute}/min < 5k`);
      if (!meetsTVL) logger.debug(`Filtered ${data.token_symbol}: TVL ${data.tvl} not in range`);
      if (!meetsAge) logger.debug(`Filtered ${data.token_symbol}: Age ${data.age_hours}h not in range 3h-7d`);

      return meetsMC && meetsVolume && meetsTVL && meetsFee && meetsAge;
    });
  }

  /**
   * Save candidates to database
   */
  saveToDatabase(candidates) {
    logger.debug(`${this.name}: Saving ${candidates.length} candidates to database`);

    for (const candidate of candidates) {
      try {
        // Save pool
        stateManager.upsertPool({
          pool_address: candidate.pool_address,
          token_symbol: candidate.token_symbol,
          token_address: candidate.token_address,
          base_fee: candidate.base_fee,
          tvl: candidate.tvl
        });

        // Save price history
        stateManager.addPriceHistory({
          pool_address: candidate.pool_address,
          price: candidate.price_usd,
          ath_price: candidate.price_usd, // Initial ATH = current price
          bottom_price: candidate.price_usd // Initial bottom = current price
        });

      } catch (error) {
        logger.error(`${this.name}: Error saving candidate ${candidate.pool_address}`, error);
      }
    }
  }

  /**
   * Emit empty data event
   */
  emitEmptyData() {
    const eventData = {
      pools: [],
      timestamp: new Date().toISOString(),
      stats: {
        total_pools: 0,
        filtered_pools: 0,
        candidates: 0,
        duration_ms: 0
      }
    };

    eventBus.emit('data:ready', eventData);
    return eventData;
  }
}

module.exports = new DataAggregator();
