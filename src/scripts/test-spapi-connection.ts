// src/scripts/test-spapi-connection.ts
import 'dotenv/config'; // Ensure environment variables are loaded
import { getMarketplaceParticipations } from '../lib/amazon/sp-api'; // Adjust path if needed

async function runTest() {
  console.log('--- Starting SP-API Connection Test ---');
  try {
    const participations = await getMarketplaceParticipations();
    console.log('--- SP-API Connection Test Successful ---');
    console.log('Retrieved Participations:', JSON.stringify(participations, null, 2));
  } catch {
    console.error('--- SP-API Connection Test Failed ---');
    process.exitCode = 1; // Indicate failure
  } finally {
    console.log('--- SP-API Connection Test Finished ---');
  }
}

runTest();
