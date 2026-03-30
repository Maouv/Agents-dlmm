const logger = require('../utils/logger');
const eventBus = require('../core/eventBus');
const stateManager = require('../core/stateManager');
const poolScanner = require('./poolScanner');
const priceFetcher = require('./priceFetcher');
const volumeTracker = require('./volumeTracker');
const tokenMetricsFetcher = require('./tokenMetricsFetcher');
const lpAgentFetcher = require('./lpAgentFetcher');
const dlmmSDK = require('../services/dlmmSDK');

class DataAggregatorV2 {
  constructor() {
    this.name = 'DataAggregatorV2';
    logger.info(`${this.name} initialized`);
  }

  /**
   * Enhanced aggregation with LP Agent IO + Top LPers analysis
   */
  async aggregate() {
    try {
      logger.info(`${this.name}: Starting enhanced data aggregation...`);
      const startTime = Date.now();

      // PHASE 1: Pool Discovery
      logger.info(`${this.name}: Phase 1 - Pool Discovery`);

      // Option A: Use Meteora API (existing)
      const meteoraPools = await poolScanner.fetchPools();

      // Option B: Use LP Agent IO discover (new)
      // const lpPools = await lpAgentFetcher.discoverPools({
      //   sortBy: 'fee_tvl_ratio',
      //   minOrganicScore: 60,
      //   minAgeHr: 3,
      //   maxAgeHr: 168,
      //   min24hVol: 5000,
      //   limit: 50
      // });

      // Use Meteora for now (LP Agent IO might need API key)
      const allPools = meteoraPools;

      logger.info(`${this.name}: Found ${allPools.length} total pools`);

      // LOG: Pools discovered
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`📋 POOLS DISCOVERED (${allPools.length})`);
      logger.info(`${'='.repeat(60)}`);
      allPools.forEach((pool, idx) => {
        logger.info(`${idx + 1}. ${pool.token_symbol || 'UNKNOWN'}`);
        logger.info(`   Pool: ${pool.pool_address}`);
        logger.info(`   TVL: $${(pool.tvl || 0).toLocaleString()}`);
        logger.info(`   Token X: ${pool.token_x_address || 'N/A'}`);
      });

      // PHASE 2: Initial Filtering
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`${this.name}: Phase 2 - Initial Filtering`);
      logger.info(`${'='.repeat(60)}`);
      const filteredPools = this.initialFilter(allPools);

      if (filteredPools.length === 0) {
        logger.warn(`${this.name}: No pools meet initial criteria`);
        return this.emitEmptyData();
      }

      logger.info(`${this.name}: ${filteredPools.length} pools passed initial filter`);

      // LOG: Pools after filtering
      if (filteredPools.length > 0) {
        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`✅ POOLS PASSED FILTER (${filteredPools.length})`);
        logger.info(`${'='.repeat(60)}`);
        filteredPools.forEach((pool, idx) => {
          logger.info(`${idx + 1}. ${pool.token_symbol || 'UNKNOWN'} - TVL: $${(pool.tvl || 0).toLocaleString()}`);
        });
      }

      // PHASE 3: Parallel Data Fetching
      logger.info(`${this.name}: Phase 3 - Parallel Data Fetching`);

      const tokenAddresses = [...new Set(
        filteredPools
          .map(p => p.token_x_address || p.token_address)
          .filter(addr => addr && addr !== 'UNKNOWN')
      )];

      logger.info(`${this.name}: Fetching data for ${tokenAddresses.length} unique tokens`);

      // Fetch prices, volumes, metadata in parallel
      const [prices, volumes, metadata] = await Promise.all([
        priceFetcher.fetchMultiplePrices(tokenAddresses),
        volumeTracker.fetchMultipleVolumes(tokenAddresses),
        tokenMetricsFetcher.fetchMultipleMetadata(tokenAddresses)
      ]);

      logger.info(`${this.name}: Fetched ${prices.length} prices, ${volumes.length} volumes, ${metadata.length} metadata`);

      // Combine all data
      let combinedData = this.combineData(filteredPools, prices, volumes, metadata);

      // PHASE 4: LP Agent IO Enrichment + Top LPers Analysis (Sequential with rate limiting)
      logger.info(`${this.name}: Phase 4 - LP Agent IO Enrichment (rate limited to 5 pools)`);

      // IMPORTANT: LP Agent IO free tier = 5 RPM
      // Only enrich top 5 candidates to stay within rate limit
      const maxPoolsToEnrich = 5;
      const poolsToEnrich = combinedData.slice(0, maxPoolsToEnrich);

      logger.info(`${this.name}: Enriching ${poolsToEnrich.length} pools (rate limit: 5 RPM)`);

      // LOG: Pools to be enriched
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`🔍 POOLS TO ENRICH WITH LPERS DATA (${poolsToEnrich.length})`);
      logger.info(`${'='.repeat(60)}`);
      poolsToEnrich.forEach((pool, idx) => {
        logger.info(`${idx + 1}. ${pool.token_symbol || 'UNKNOWN'}`);
        logger.info(`   Pool: ${pool.pool_address}`);
        logger.info(`   TVL: $${(pool.tvl || 0).toLocaleString()}`);
      });

      // Process SEQUENTIALLY to respect rate limit (12s between requests)
      const enrichedData = [];
      for (const pool of poolsToEnrich) {
        try {
          logger.info(`${this.name}: Enriching pool ${pool.pool_address} (${poolsToEnrich.indexOf(pool) + 1}/${poolsToEnrich.length})`);

          // Get top LPers for this pool (will auto-wait for rate limit)
          const topLpers = await lpAgentFetcher.getTopLpers(pool.pool_address, 5);

          // Analyze LPers patterns
          const lperAnalysis = lpAgentFetcher.analyzeLperPatterns(topLpers);

          // Validate pool with DLMM SDK
          const poolValidation = await dlmmSDK.validatePool(pool.pool_address);

          enrichedData.push({
            ...pool,
            top_lpers: topLpers,
            lper_analysis: lperAnalysis,
            pool_validation: poolValidation
          });
        } catch (error) {
          logger.error(`Error enriching pool ${pool.pool_address}`, error);
          enrichedData.push(pool);
        }
      }

      combinedData = [...enrichedData, ...combinedData.slice(maxPoolsToEnrich)];

      logger.info(`${this.name}: Enriched ${enrichedData.length} pools with LPers data`);

      // PHASE 5: Final Filtering & Ranking
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`${this.name}: Phase 5 - Final Filtering & Ranking`);
      logger.info(`${'='.repeat(60)}`);

      const candidates = this.applyFinalFilters(combinedData);

      // LOG: Final candidates
      if (candidates.length > 0) {
        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`🎯 FINAL CANDIDATES (${candidates.length})`);
        logger.info(`${'='.repeat(60)}`);
        candidates.forEach((pool, idx) => {
          logger.info(`\n${idx + 1}. ${pool.token_symbol || 'UNKNOWN'}`);
          logger.info(`   Pool: ${pool.pool_address}`);
          logger.info(`   TVL: $${(pool.tvl || 0).toLocaleString()}`);
          logger.info(`   Volume: $${(pool.volume_24h || 0).toLocaleString()}`);
          logger.info(`   LPers: ${pool.lper_analysis?.qualified_count || 0} qualified`);
          logger.info(`   Strategy: ${pool.lper_analysis?.preferred_strategy || 'N/A'}`);
        });
      } else {
        logger.warn(`\n⚠️  NO CANDIDATES PASSED FINAL FILTER`);
      }

      // PHASE 6: Save to Database
      this.saveToDatabase(candidates);

      const duration = Date.now() - startTime;
      logger.success(`${this.name}: Aggregation complete in ${duration}ms`);
      logger.info(`${this.name}: Found ${candidates.length} candidates with LPers insights`);

      // Emit data ready event
      const eventData = {
        pools: candidates,
        timestamp: new Date().toISOString(),
        stats: {
          total_pools: allPools.length,
          filtered_pools: filteredPools.length,
          enriched_pools: combinedData.length,
          final_candidates: candidates.length,
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
   * Initial filter (relaxed criteria)
   */
  initialFilter(pools) {
    return pools.filter(pool => {
      return pool.tvl > 0;
    });
  }

  /**
   * Combine all data sources
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
        volatility: Math.abs(price.price_change_24h || 0),
        fee_tvl_ratio: pool.tvl > 0 ? (pool.base_fee / pool.tvl) : 0,

        // LPers data (will be populated later)
        top_lpers: null,
        lper_analysis: null,
        pool_validation: null
      };
    });
  }

  /**
   * Apply final filters with LPers insights
   */
  applyFinalFilters(pools) {
    logger.info(`${this.name}: Applying final filters with LPers data...`);

    return pools.filter(pool => {
      // Basic criteria
      const meetsMC = pool.market_cap >= 200000;
      const meetsTVL = pool.tvl > 0 && pool.tvl < 100000;
      const meetsVolume = pool.volume_per_minute >= 5000;

      // LPers quality check
      const hasQualifiedLpers = pool.lper_analysis &&
                               pool.lper_analysis.qualified_count >= 1 &&
                               pool.lper_analysis.avg_win_rate >= 0.6;

      // Pool validation
      const isValidPool = pool.pool_validation && pool.pool_validation.isValid;

      // Log filtering reasons
      if (!meetsMC) logger.debug(`Filtered ${pool.token_symbol}: MC ${pool.market_cap} < 200k`);
      if (!meetsTVL) logger.debug(`Filtered ${pool.token_symbol}: TVL ${pool.tvl} not in range`);
      if (!meetsVolume) logger.debug(`Filtered ${pool.token_symbol}: Volume ${pool.volume_per_minute}/min < 5k`);
      if (!hasQualifiedLpers) logger.debug(`Filtered ${pool.token_symbol}: No qualified LPers`);
      if (!isValidPool) logger.debug(`Filtered ${pool.token_symbol}: Pool validation failed`);

      // At minimum: valid pool
      // LPers data is bonus (might not have it for all pools)
      return isValidPool && (meetsMC || hasQualifiedLpers);
    });
  }

  /**
   * Save candidates to database
   */
  saveToDatabase(candidates) {
    logger.debug(`${this.name}: Saving ${candidates.length} candidates to database`);

    for (const candidate of candidates) {
      try {
        stateManager.upsertPool({
          pool_address: candidate.pool_address,
          token_symbol: candidate.token_symbol,
          token_address: candidate.token_address,
          base_fee: candidate.base_fee,
          tvl: candidate.tvl
        });

        stateManager.addPriceHistory({
          pool_address: candidate.pool_address,
          price: candidate.price_usd,
          ath_price: candidate.price_usd,
          bottom_price: candidate.price_usd
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
        enriched_pools: 0,
        final_candidates: 0,
        duration_ms: 0
      }
    };

    eventBus.emit('data:ready', eventData);
    return eventData;
  }
}

module.exports = new DataAggregatorV2();
