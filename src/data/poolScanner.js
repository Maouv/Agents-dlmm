const logger = require('../utils/logger');

class PoolScanner {
  constructor() {
    this.name = 'PoolScanner';
    this.baseUrl = 'https://dlmm.datapi.meteora.ag';

    logger.info(`${this.name} initialized`);
  }

  /**
   * Fetch DLMM pools from Meteora API
   * Docs: https://docs.meteora.ag/api-reference/dlmm/overview
   */
  async fetchPools(limit = 100) {
    try {
      logger.info(`${this.name}: Fetching DLMM pools...`);

      const response = await fetch(`${this.baseUrl}/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Meteora API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Log response structure for debugging
      logger.debug(`${this.name}: Response type: ${typeof data}`);
      logger.debug(`${this.name}: Response keys: ${Object.keys(data || {}).join(', ')}`);

      // Handle different response formats
      let poolsArray = [];
      if (Array.isArray(data)) {
        poolsArray = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        poolsArray = data.data;
      } else if (data && data.pools && Array.isArray(data.pools)) {
        poolsArray = data.pools;
      } else if (data && data.result && Array.isArray(data.result)) {
        poolsArray = data.result;
      } else {
        logger.error(`${this.name}: Unexpected response format`, { data: JSON.stringify(data).substring(0, 200) });
        throw new Error('Invalid response format from Meteora API');
      }

      logger.success(`${this.name}: Fetched ${poolsArray.length} pools`);

      // Transform and filter pools
      const pools = poolsArray.map(pool => ({
        pool_address: pool.address || pool.pool_address,
        token_symbol: pool.token_x?.symbol || pool.token_y?.symbol || 'UNKNOWN',
        token_x_address: pool.token_x?.address || pool.token_x_address,
        token_y_address: pool.token_y?.address || pool.token_y_address,
        base_fee: parseFloat(pool.base_fee || pool.fee_rate || 0),
        tvl: parseFloat(pool.tvl || pool.liquidity || 0),
        volume_24h: parseFloat(pool.volume_24h || 0),
        apr: parseFloat(pool.apr || 0),
        bin_step: parseInt(pool.bin_step || 1),
        number_of_bins: parseInt(pool.number_of_bins || 0)
      }));

      return pools;

    } catch (error) {
      logger.error(`${this.name}: Error fetching pools`, error);
      throw error;
    }
  }

  /**
   * Get pool details by address
   */
  async getPoolDetails(poolAddress) {
    try {
      logger.debug(`${this.name}: Fetching pool details for ${poolAddress}`);

      const response = await fetch(`${this.baseUrl}/pools/${poolAddress}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Meteora API error: ${response.status}`);
      }

      const pool = await response.json();

      return {
        pool_address: pool.address || poolAddress,
        token_symbol: pool.token_x?.symbol || 'UNKNOWN',
        token_address: pool.token_x?.mint,
        base_fee: parseFloat(pool.base_fee || 0),
        tvl: parseFloat(pool.tvl || 0),
        volume_24h: parseFloat(pool.volume_24h || 0),
        apr: parseFloat(pool.apr || 0),
        bins: pool.bins || [],
        active_bin: pool.active_bin || 0
      };

    } catch (error) {
      logger.error(`${this.name}: Error fetching pool details`, error);
      throw error;
    }
  }

  /**
   * Filter pools by Rug Me criteria
   */
  filterPoolsForRugMe(pools) {
    logger.info(`${this.name}: Filtering pools for Rug Me strategy...`);

    // Log first pool for debugging
    if (pools.length > 0) {
      logger.debug(`${this.name}: Sample pool data:`, JSON.stringify(pools[0], null, 2));
    }

    const filtered = pools.filter(pool => {
      // Rug Me criteria (relaxed for initial filter):
      // - TVL > 0 (any pool with liquidity)
      // - Has valid fee info

      const passesTVL = pool.tvl > 0;
      const hasValidFee = pool.base_fee > 0 || pool.base_fee === 0; // Allow 0 fee pools

      // Log why pools are filtered
      if (!passesTVL) {
        logger.debug(`Filtered: TVL ${pool.tvl}`);
      }
      if (!hasValidFee) {
        logger.debug(`Filtered: Invalid fee`);
      }

      return passesTVL;
    });

    logger.info(`${this.name}: ${filtered.length} pools passed initial filter`);

    return filtered;
  }
}

module.exports = new PoolScanner();
