/**
 * @callback RetryStrategyCB
 * @param {number} numRetries Number of retries that have occurred
 * @return {number} Delay in ms before next retry
 */

/**
 * @typedef {{workerCount, hostname: (null|string), port: null|number, maxRetriesPerRequest:number, retryStrategy:RetryStrategyCB, uri: string}} RedisConfig
 */

/**
 * @typedef {{REDIS_URL:string, REDIS_CONNECTION_MAX_RETRIES:number, REDIS_RETRY_DELAY_MS: number, REDIS_WORKERS:number}} RedisConfigParam
 */

/**
 * @typedef {Object|*} LoggerSchema
 * @property {function(...*)} trace
 * @property {function(...*)} debug
 * @property {function(...*)} info
 * @property {function(...*)} warn
 * @property {function(...*)} error
 * @property {function(...*)} fatal
 */
