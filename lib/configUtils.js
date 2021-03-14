const joi = require('joi');
const url = require('url');

const configValidator = joi
  .object({
    REDIS_URL: joi
      .string()
      .uri({ scheme: 'redis' })
      .required(),
    REDIS_CONNECTION_MAX_RETRIES: joi
      .number()
      .integer()
      .min(1)
      .optional()
      .default(10),
    REDIS_RETRY_DELAY_MS: joi
      .number()
      .integer()
      .optional()
      .default(null),
    REDIS_WORKERS: joi
      .number()
      .integer()
      .optional()
      .default(3),
  })
  .unknown()
  .required();

/**
 * @param _config
 * @return RedisConfig
 */
function parseConfig(_config) {
  const { error, value } = configValidator.validate(_config);
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  const parsedUrl = url.parse(value.REDIS_URL, false, true);

  return {
    uri: value.REDIS_URL,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    retryStrategy: (retries) => {
      if (value.REDIS_RETRY_DELAY_MS) return value.REDIS_RETRY_DELAY_MS;
      return Math.min(retries * 50, 2000);
    },
    maxRetriesPerRequest: value.REDIS_CONNECTION_MAX_RETRIES,
    workerCount: value.REDIS_WORKERS,
  };
}

module.exports = { parseConfig };
