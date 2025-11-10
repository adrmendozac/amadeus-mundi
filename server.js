require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const emailRouter = require('./server/email');
const { redis, connect: connectRedis, isConfigured: isRedisConfigured } = require('./server/redisClient');

const app = express();

const { AMAD_CLIENT_ID, AMAD_CLIENT_SECRET, NODE_ENV } = process.env;

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', emailRouter);

let inMemoryToken = null;
let inMemoryExpiry = 0;
let redisReady = false;

async function readCachedToken() {
  if (!redisReady || !redis) return null;
  try {
    return await redis.get('amadeus_token');
  } catch (err) {
    console.warn('Redis read failed, disabling Redis cache:', err.message);
    redisReady = false;
    return null;
  }
}

async function writeCachedToken(token, ttl) {
  if (!redisReady || !redis) return;
  try {
    await redis.set('amadeus_token', token, 'EX', ttl);
  } catch (err) {
    console.warn('Redis write failed, disabling Redis cache:', err.message);
    redisReady = false;
  }
}

async function getAccessToken() {
  if (inMemoryToken && Date.now() < inMemoryExpiry) return inMemoryToken;

  const cached = await readCachedToken();
  if (cached) {
    inMemoryToken = cached;
    // Set a short-lived in-memory TTL so we re-check Redis regularly
    inMemoryExpiry = Date.now() + 5 * 60 * 1000;
    return cached;
  }

  const response = await axios.post(
    'https://api.amadeus.com/v1/security/oauth2/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AMAD_CLIENT_ID,
      client_secret: AMAD_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const token = response.data.access_token;
  const ttl = Math.max(response.data.expires_in - 60, 60);
  inMemoryToken = token;
  inMemoryExpiry = Date.now() + ttl * 1000;
  await writeCachedToken(token, ttl);
  return token;
}

// Temporary hold endpoint until Amadeus booking is implemented
app.post('/api/hold', (req, res) => {
  try {
    console.log('📦 Hold request received', req.body);
    res.json({
      success: true,
      message: 'Hold placeholder created successfully.',
      received: req.body
    });
  } catch (err) {
    console.error('Hold endpoint error:', err);
    res.status(500).json({ error: 'Failed to create hold' });
  }
});

// Flight search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const authToken = await getAccessToken();
    const { origin, destination, departureDate, returnDate, adults } = req.body;

    const params = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate,
      adults: String(adults || 1),
      currencyCode: 'USD',
    });
    if (returnDate) params.append('returnDate', returnDate);

    const flightRes = await axios.get(
      `https://api.amadeus.com/v2/shopping/flight-offers?${params.toString()}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    res.json(flightRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Flight search failed.' });
  }
});

app.get('/api/autocomplete', async (req, res) => {
  const { keyword } = req.query;
  if (!keyword || keyword.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const authToken = await getAccessToken();
    const response = await axios.get(
      'https://api.amadeus.com/v1/reference-data/locations',
      {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { keyword, subType: 'AIRPORT,CITY', 'page[limit]': 5 }
      }
    );
    res.json(response.data.data); // return an array
  } catch (err) {
    console.error('autocomplete server error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Autocomplete failed' });
  }
});


const PORT = process.env.PORT || 3000;

async function startServer() {
  if (isRedisConfigured) {
    try {
      await connectRedis();
      redisReady = true;
    } catch (err) {
      console.warn(`⚠️ Redis connection failed (${err.message}). Continuing with in-memory cache.`);
      if (redis && typeof redis.disconnect === 'function') {
        redis.disconnect();
      }
    }
  } else {
    console.log('ℹ️ No REDIS_URL provided. Using in-memory token cache only.');
  }

  app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });
}

startServer();
