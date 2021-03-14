# RedisClient
A simple wrapper around `ioredis` and `redlock` libs for JSON data.

## Features
- All data is automatically stringified / parsed from JSON format by default
    - All methods can operate on non-JSON data with a simple override.
- 100% Promise compliant using `bluebird`
- Simplified redis methods like `scan`
- Added utility methods like `deleteByPattern`
- Handle mutations that require locking easily with `protectedMutation`

## Usage
```
const RedisClient = require('@kevin-coelho/RedisClient');
const config = {
    REDIS_URL: 'redis://localhost:6793' 
};
const client = new RedisClient(config);

// get, set, delete keys
await client.set('someKey', { value: 'I will become a JSON string!' });

// '{\"value\":\"I will become a JSON string!\"}'
await client.get('someKey', false);

// { value: 'I will become a JSON string!' }
await client.get('someKey');

await client.set('someKey2', 'Just a string!');

// fetch all keys matching a pattern --> ['someKey', 'someKey2'];
const keys = await client.scan('someKey*');

// delete individual keys
await client.del(keys[0], keys[1]);

// delete all keys matching a pattern
await client.deleteByPattern('someKey*');

// perform a protected (locked) mutation
const mutationFn1 = async () => {
    await client.set('key1', 'value1');
    await client.set('key2', 'value2');
    await client.del('key3', 'key4');
};

const mutationFn2 = async () => {
    const value1 = await client.get('key1');
    await client.set('key2', value1);
    await client.del('key1');
};

const handleFailedLockRelease = (mutationIdx) => (err) => {
    console.error(`Mutation ${mutationIdx} Failed to acquire lock!`);
    console.error(err);
};

const resourceKey = 'ProtectedMutation:Test';
const ttl = 10000; // time in ms until lock expires

// probably only 1 of these will succeed and 1 will fail with "Failed to acquire lock" error
await Promise.join(
    client.protectedMutation(resourceKey, ttl, mutationFn1, handleFailedLockRelease(1)),
    client.protectedMutation(resourceKey, ttl, mutationFn2, handleFailedLockRelease(2)),  
);
```
