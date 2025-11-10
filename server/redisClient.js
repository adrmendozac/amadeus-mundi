const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
let redis = null;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: attempt => Math.min(attempt * 200, 2000)
  });

  redis.on('connect', () => console.log('✅ Redis connected'));
  redis.on('error', err => console.error('Redis error', err));
} else {
  console.log('ℹ️ Redis caching disabled (REDIS_URL not set)');
}

async function connect() {
  if (!redis) throw new Error('Redis client not configured');
  if (redis.status === 'ready' || redis.status === 'connect') return redis;
  if (redis.status === 'connecting' || redis.status === 'reconnecting') return redis;
  await redis.connect();
  return redis;
}

module.exports = { redis, connect, isConfigured: Boolean(redisUrl) };
