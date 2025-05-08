import { createSecureApiClient } from '../api/secure-client';

import type { AxiosInstance } from 'axios';


// Lazy‑initialised ShipStation client
// – avoids crashing the build when creds are absent –

let cachedClient: AxiosInstance | null = null;

function createClient(): AxiosInstance {
  if (cachedClient) return cachedClient;

  const { SHIPSTATION_API_KEY, SHIPSTATION_API_SECRET } = process.env;

  if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET)
    throw new Error('ShipStation API Key and Secret must be provided in environment variables.');

  cachedClient = createSecureApiClient({
    baseURL: 'https://ssapi.shipstation.com',
    headers: {
      Authorization: `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });

  return cachedClient;
}

// Export a Proxy so existing `shipstationApi.get(...)` calls still work.
// The proxy delegates property access to the real client created on first use.
export const shipstationApi = new Proxy({} as AxiosInstance, {
  get(_target, prop) {
    // Ensure the real client exists
    const client = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic proxy forwarding
    const value = (client as any)[prop as any];
    // If the property is a function, preserve `this`
    return typeof value === 'function' ? value.bind(client) : value;
  }
}) as AxiosInstance;

// Named helper for explicit access if preferred elsewhere
export const getShipstationApi = createClient
