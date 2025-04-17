import { createSecureApiClient } from '../api/secure-client';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;

if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
  throw new Error('ShipStation API Key and Secret must be provided in environment variables.');
}

// Use secure axios instance configured for ShipStation API
// This addresses CWE-311 (Transport Encryption) by enforcing proper SSL validation
export const shipstationApi = createSecureApiClient({
  baseURL: 'https://ssapi.shipstation.com',
  headers: {
    Authorization: `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/json',
  },
});
