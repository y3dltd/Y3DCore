import axios from 'axios'

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET

if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
  throw new Error('ShipStation API Key and Secret must be provided in environment variables.')
}

// Axios instance configured for ShipStation API
export const shipstationApi = axios.create({
  baseURL: 'https://ssapi.shipstation.com',
  headers: {
    'Authorization': `Basic ${Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/json',
  },
}) 
