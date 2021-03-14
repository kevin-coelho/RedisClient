// deps
const Promise = require('bluebird');
const Redis = require('ioredis');
const chalk = require('chalk');
const Redlock = require('redlock');

// module deps
const { parseConfig } = require('./lib/configUtils');

class RedisClient {

    /**
     * @param {RedisConfigParam} config
     * @param {LoggerSchema} logger
     */
    constructor(config, logger = console) {
        this.logger = logger;
        this.config = parseConfig(config);
        this.redis = new Redis(this.config.uri, {
            retryStrategy: this.config.retryStrategy,
            maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        });
        this.lockManager = new Redlock([this.redis], {
            retryCount: 0,
        });
        this.registerRedisEventHandlers();
    }

    /**
     * Get base client (ioredis)
     */
    getBaseClient() {
        return this.redis;
    }

    /**
     * @description
     * Locking mutation for a specific resource. Acquire a lock given resourceKey
     * and ttl and attempt to execute mutationFn asynchronously. If mutationFn
     * succeeds, resolve with the result. If mutationFn fails or throws,
     * resolve with the Error object. If a lock is failed to be acquired, this
     * function will reject with the error. If a lock is failed to be released
     * and handleFailedLockRelease is provided, the function will be called with
     * the error object (and this fn will resolve with the results or error of
     * mutationFn). If handleFailedLockRelease is not provided, this fn will
     * log the error using the logger provided to new RedisClient().
     * @param {string} resourceKey
     * @param {number} ttl Time in ms until lock expires
     * @param {function(...):Promise<*>} mutationFn Async function (must return a Promise)
     * @param {function(Error):*} handleFailedLockRelease
     * @return {Promise<*|Error>}
     */
    async protectedMutation(
        resourceKey,
        ttl,
        mutationFn,
        handleFailedLockRelease = null,
    ) {
        const lock = await this.lockManager.lock(resourceKey, ttl);
        const handleUnlock = async () => {
            await lock.unlock().catch(err => {
                if (handleFailedLockRelease) handleFailedLockRelease(err);
                else {
                    this.logger.error({
                        err,
                    });
                }
            });
        };

        try {
            const result = await mutationFn();
            await handleUnlock();
            return result;
        } catch (err) {
            await handleUnlock();
            return err;
        }
    }

    /**
     * Register event listeners
     */
    registerRedisEventHandlers() {
        this.redis.on('connect', this.connectHandler.bind(this));
        this.redis.on('reconnecting', this.reconnectingHandler.bind(this));
        this.redis.on('error', this.errorHandler.bind(this));
        this.lockManager.on('clientError', this.lockClientErrorHandler.bind(this));
    }

    /**
     * Unregister event listeners
     */
    unregisterRedisEventHandlers() {
        this.lockManager.removeListener('clientError', this.lockClientErrorHandler);
        this.redis.removeListener('connect', this.connectHandler);
        this.redis.removeListener('reconnecting', this.reconnectingHandler);
        this.redis.removeListener('error', this.errorHandler);
    }

    /**
     * Log connection event
     */
    connectHandler() {
        this.logger.info(`Connected to redis ${chalk.green(config.redis.uri)}`);
    }

    /**
     * Log reconnecting event
     * @param {number} retryIn ms until next retry
     */
    reconnectingHandler(retryIn) {
        this.logger.warn(
            `Redis connection was lost, attempting reconnect in ${retryIn}ms`,
        );
    }

    /**
     * Log connection errors
     * @param {Error} err
     */
    errorHandler(err) {
        this.logger.error({ err });
        this.logger.error('Redis connection error');
    }

    /**
     * Log redlock errors
     * @param err
     */
    lockClientErrorHandler(err) {
        this.logger.error({ err });
        this.logger.error('redlock error');
    }

    /**
     * Remove listeners and disconnect
     *
     * @return {Promise<void>}
     */
    async shutdown() {
        this.unregisterRedisEventHandlers();
        return new Promise((resolve, reject) =>
            this.lockManager.quit(err =>
                err
                    ? reject(err)
                    : resolve(this.logger.warn('Connection to redis closed')),
            ),
        );
    }

    /**
     * Ping redis
     * @example
     * await pingRedis();
     * prints -->
     * 		Ping redis "PONG"
     * @return {Promise<void>} Resolves if the ping succeeds, rejects otherwise.
     */
    async ping() {
        const res = await this.redis.ping();
        this.logger.debug('Ping redis', res);
    }

    /**
     * @param {string} key
     * @param {boolean} [json]
     * @return {Promise<any>}
     */
    async get(key, json = true) {
        const res = await this.redis.get(key);
        if (json) return JSON.parse(res);
        return res;
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {boolean} [json]
     * @return {Promise<void>}
     */
    async set(key, value, json = true) {
        if (json) value = JSON.stringify(value);
        await this.redis.set(key, value);
    }

    /**
     * @param {Array<string>} keys
     * @return {Promise<void>}
     */
    async del(...keys) {
        return this.redis.del(keys);
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {boolean} [json]
     * @return {Promise<void>}
     */
    async lpush(key, value, json = true) {
        if (json) value = JSON.stringify(value);
        await this.redis.lpush(key, value);
    }

    /**
     * @param {string} pattern
     * @return {Promise<string[]>}
     */
    async scan(pattern) {
        const stream = this.redis.scanStream({
            match: pattern,
        });
        return new Promise((resolve, reject) => {
            const keys = [];
            stream.on('data', _keys => keys.push(..._keys));
            stream.on('error', err => reject(err));
            stream.on('end', () => resolve(keys));
        });
    }

    /**
     * @param {string} pattern
     * @return {Promise<void>}
     */
    async deleteByPattern(pattern) {
        const keys = await this.scan(pattern);
        return this.del(keys);
    }

    /**
     * @param {string} key
     * @param {boolean} [json]
     * @return {Promise<any|null>}
     */
    async lpop(key, json = true) {
        const res = await this.redis.lpop(key);
        if (!res) return null;
        if (json) return JSON.parse(res);
        return res;
    }

    /**
     * @param {string} src
     * @param {string} dest
     * @param {boolean} [json]
     * @return {Promise<string|null|any>}
     */
    async rpoplpush(src, dest, json = true) {
        const res = await this.redis.rpoplpush(src, dest);
        if (!res) return null;
        if (json) return JSON.parse(res);
        return res;
    }
}

module.exports = RedisClient;
