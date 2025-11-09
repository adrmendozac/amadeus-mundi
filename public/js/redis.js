const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryStrategy: attempt => Math.min(attempt * 200, 2000)
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', err => console.error('Redis error', err));

async function connect() {
  if (redis.status === 'end') throw new Error('Redis client closed');
  if (redis.status === 'wait' || redis.status === 'end') return redis.connect();
  return redis;
}

module.exports = { redis, connect };