require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { AMAD_CLIENT_ID, AMAD_CLIENT_SECRET } = process.env;

let token = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (token && Date.now() < tokenExpiry) return token;
  const response = await axios.post(
    'https://test.api.amadeus.com/v1/security/oauth2/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AMAD_CLIENT_ID,
      client_secret: AMAD_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  token = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000; // refresh 1 min early
  return token;
}

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
      `https://test.api.amadeus.com/v2/shopping/flight-offers?${params.toString()}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    res.json(flightRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Flight search failed.' });
  }
});

// server.js
app.get('/api/autocomplete', async (req, res) => {
  const { keyword } = req.query;
  if (!keyword || keyword.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const authToken = await getAccessToken();
    const response = await axios.get(
      'https://test.api.amadeus.com/v1/reference-data/locations',
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
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});