"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/test-spapi-connection.ts
require("dotenv/config"); // Ensure environment variables are loaded
const sp_api_1 = require("../lib/amazon/sp-api"); // Adjust path if needed
async function runTest() {
    console.log('--- Starting SP-API Connection Test ---');
    try {
        const participations = await (0, sp_api_1.getMarketplaceParticipations)();
        console.log('--- SP-API Connection Test Successful ---');
        console.log('Retrieved Participations:', JSON.stringify(participations, null, 2));
    }
    catch {
        console.error('--- SP-API Connection Test Failed ---');
        process.exitCode = 1; // Indicate failure
    }
    finally {
        console.log('--- SP-API Connection Test Finished ---');
    }
}
runTest();
