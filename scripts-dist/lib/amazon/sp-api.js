"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderItems = exports.getMarketplaceParticipations = exports.makeSpapiRequest = void 0;
// src/lib/amazon/sp-api.ts
require("dotenv/config"); // Load .env variables
const sha256_js_1 = require("@aws-crypto/sha256-js"); // Use JS implementation for broader compatibility
const signature_v4_1 = require("@aws-sdk/signature-v4");
const protocol_http_1 = require("@smithy/protocol-http");
const url_parser_1 = require("@smithy/url-parser");
const secure_client_1 = require("../api/secure-client");
// --- Configuration from Environment Variables ---
const LWA_CLIENT_ID = process.env.SPAPI_LWA_APP_CLIENT_ID;
const LWA_CLIENT_SECRET = process.env.SPAPI_LWA_APP_CLIENT_SECRET;
const LWA_REFRESH_TOKEN = process.env.SPAPI_LWA_REFRESH_TOKEN;
const AWS_ACCESS_KEY_ID = process.env.SPAPI_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.SPAPI_AWS_SECRET_ACCESS_KEY;
// const AWS_ROLE_ARN = process.env.SPAPI_AWS_ROLE_ARN; // For future role-based auth
const SPAPI_ENDPOINT = process.env.SPAPI_ENDPOINT;
const SPAPI_REGION = SPAPI_ENDPOINT?.includes('eu')
    ? 'eu-west-1' // Infer region (adjust if needed)
    : SPAPI_ENDPOINT?.includes('na')
        ? 'us-east-1'
        : SPAPI_ENDPOINT?.includes('fe')
            ? 'us-west-2'
            : 'us-east-1'; // Default or throw error
const LWA_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token';
// Basic validation
if (!LWA_CLIENT_ID ||
    !LWA_CLIENT_SECRET ||
    !LWA_REFRESH_TOKEN ||
    !AWS_ACCESS_KEY_ID ||
    !AWS_SECRET_ACCESS_KEY ||
    !SPAPI_ENDPOINT) {
    console.error('SP-API Error: Missing required environment variables. Check your .env file.');
    // In a real app, throw an error or handle this more gracefully
    process.exit(1);
}
let cachedLwaToken = null;
/**
 * Gets a valid LWA Access Token, refreshing if necessary.
 */
async function getLwaAccessToken() {
    const now = Date.now();
    // Check cache, allowing a 60-second buffer before expiry
    if (cachedLwaToken && cachedLwaToken.expires_at > now + 60000) {
        console.log('Using cached LWA token.');
        return cachedLwaToken.access_token;
    }
    console.log('Refreshing LWA token...');
    try {
        // Use secure client for LWA token refresh
        const secureClient = (0, secure_client_1.createSecureApiClient)();
        const response = await secureClient.post(LWA_TOKEN_ENDPOINT, {
            grant_type: 'refresh_token',
            refresh_token: LWA_REFRESH_TOKEN,
            client_id: LWA_CLIENT_ID,
            client_secret: LWA_CLIENT_SECRET,
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const tokenData = response.data;
        if (!tokenData.access_token || !tokenData.expires_in) {
            throw new Error('Invalid LWA token response');
        }
        cachedLwaToken = {
            access_token: tokenData.access_token,
            // Calculate expiry timestamp (expires_in is in seconds)
            expires_at: now + tokenData.expires_in * 1000,
        };
        console.log('LWA token refreshed successfully.');
        // cachedLwaToken is guaranteed to be non-null here after successful assignment
        return cachedLwaToken.access_token;
    }
    catch (error) {
        let message = 'Unknown error refreshing LWA token';
        if (error instanceof Error) {
            // Check for axios error properties
            const axiosError = error;
            if (axiosError.isAxiosError && axiosError.response) {
                // It's an Axios error with a response
                message = `Error refreshing LWA token: ${JSON.stringify(axiosError.response.data)} (Status: ${axiosError.response.status})`;
            }
            else if (axiosError.isAxiosError) {
                // Axios error without a response (e.g., network error)
                message = `Error refreshing LWA token: ${axiosError.message}`;
            }
            else {
                // Not an Axios error, just use the standard Error message
                message = `Error refreshing LWA token: ${error.message}`;
            }
        }
        else if (typeof error === 'string') {
            // Handle plain string errors
            message = `Error refreshing LWA token: ${error}`;
        }
        console.error(message);
        throw new Error(message); // Re-throw with more context
    }
}
/**
 * Requests a Restricted Data Token (RDT) for accessing PII.
 */
async function getRestrictedDataToken(targetPath, targetMethod) {
    console.log(`Requesting RDT for ${targetMethod} ${targetPath}...`);
    const rdtPath = '/tokens/2021-03-01/restrictedDataToken';
    const body = {
        restrictedResources: [
            {
                method: targetMethod.toUpperCase(),
                path: targetPath,
                // dataElements: ["buyerInfo", "shippingAddress"] // Optional: Specify data elements if needed
            },
        ],
        // targetApplication?: string; // Optional: For delegated access
    };
    try {
        // Note: The request for an RDT itself uses the standard LWA token flow
        const response = await makeSpapiRequest('POST', rdtPath, {}, body);
        if (!response.restrictedDataToken) {
            throw new Error('Invalid RDT response: restrictedDataToken missing');
        }
        console.log('RDT obtained successfully.');
        return response.restrictedDataToken;
    }
    catch (error) {
        console.error(`Failed to get RDT for ${targetPath}:`, error);
        throw new Error(`Failed to obtain Restricted Data Token for ${targetPath}`);
    }
}
// --- AWS Signature V4 Signing ---
const signer = new signature_v4_1.SignatureV4({
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        // sessionToken: optional - needed if using temporary credentials/role assumption
    },
    region: SPAPI_REGION,
    service: 'execute-api',
    sha256: sha256_js_1.Sha256,
});
/**
 * Creates signed headers for an SP-API request.
 */
async function createSignedHeaders(method, path, queryParams = {}, body, // Allow object, array, or undefined
useRdt = false // Flag to indicate if RDT is needed
) {
    let accessToken;
    if (useRdt) {
        // Get RDT specifically for this request path/method
        accessToken = await getRestrictedDataToken(path, method);
    }
    else {
        // Use standard LWA access token
        accessToken = await getLwaAccessToken();
    }
    const url = (0, url_parser_1.parseUrl)(`${SPAPI_ENDPOINT}${path}`); // Use URL parser
    const request = new protocol_http_1.HttpRequest({
        method: method.toUpperCase(),
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.path,
        query: queryParams,
        headers: {
            host: url.hostname,
            'x-amz-access-token': accessToken,
            'user-agent': 'Yorkshire3DHubIntegration/1.0 (Language=TypeScript)',
            // Add content-type header if body exists
            ...(body && { 'content-type': 'application/json' }),
        },
        // Ensure body is stringified if it exists
        body: body ? JSON.stringify(body) : undefined,
    });
    // Ensure the request object is correctly passed
    // Signing happens the same way whether using LWA token or RDT
    const signedRequest = await signer.sign(request);
    // Return only the headers from the signed request
    return signedRequest.headers;
}
// --- SP-API Request Function ---
/**
 * Makes a signed request to the Selling Partner API.
 */
async function makeSpapiRequest(// Default generic to unknown
method, path, queryParams = {}, body, // Match type from createSignedHeaders
useRdt = false // Pass RDT flag down
) {
    try {
        // Pass useRdt flag to header creation
        const headers = await createSignedHeaders(method, path, queryParams, body, useRdt);
        const config = {
            method: method,
            url: `${SPAPI_ENDPOINT}${path}`,
            params: queryParams,
            headers: headers,
            data: body, // Axios handles JSON stringification if object
        };
        console.log(`Making SP-API request (${useRdt ? 'RDT' : 'LWA'}): ${method} ${config.url}`);
        // Use secure client for SP-API requests
        const secureClient = (0, secure_client_1.createSecureApiClient)();
        const response = await secureClient(config);
        return response.data;
    }
    catch (error) {
        console.error(`SP-API Request Failed: ${method} ${path}`);
        let errorMessage = `SP-API request failed: Unknown error`;
        // Handle error appropriately with type checking
        const axiosError = error;
        if (axiosError.isAxiosError) {
            if (axiosError.config) {
                console.error('Axios Config:', JSON.stringify(axiosError.config, null, 2));
            }
            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('Error Status:', axiosError.response.status);
                console.error('Error Headers:', JSON.stringify(axiosError.response.headers, null, 2));
                console.error('Error Data:', JSON.stringify(axiosError.response.data, null, 2));
                errorMessage = `SP-API request failed: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`;
            }
            else if (axiosError.request) {
                // The request was made but no response was received
                console.error('Error Request:', axiosError.request);
                errorMessage = `SP-API request failed: No response received`;
            }
            else {
                // Something happened in setting up the request that triggered an Error
                console.error('Error Message:', axiosError.message);
                errorMessage = `SP-API request failed: ${axiosError.message}`;
            }
        }
        else if (error instanceof Error) {
            console.error('Error Message:', error.message);
            errorMessage = `SP-API request failed: ${error.message}`;
        }
        else {
            console.error('Unexpected Error Type:', error);
        }
        // Re-throw a more specific error or handle as needed
        throw new Error(errorMessage);
    }
}
exports.makeSpapiRequest = makeSpapiRequest;
// --- Example Usage (Optional - for testing) ---
/**
 * Example function to get marketplace participations.
 */
async function getMarketplaceParticipations() {
    console.log('Attempting to get marketplace participations...');
    // This is a simple GET request, no query params or body needed
    const path = '/sellers/v1/marketplaceParticipations';
    try {
        const result = await makeSpapiRequest('GET', path);
        console.log('Marketplace Participations:', JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        console.error('Failed to get marketplace participations:', error);
        // Handle or rethrow
        throw error;
    }
}
exports.getMarketplaceParticipations = getMarketplaceParticipations;
/**
 * Gets order items for a specific order ID. Requires RDT.
 */
async function getOrderItems(orderId) {
    console.log(`Attempting to get order items for order ID: ${orderId}...`);
    const path = `/orders/v0/orders/${orderId}/orderItems`;
    try {
        // Make request using RDT
        const result = await makeSpapiRequest('GET', path, {}, undefined, true);
        console.log(`Successfully retrieved order items for ${orderId}.`);
        return result;
    }
    catch (error) {
        console.error(`Failed to get order items for ${orderId}:`, error);
        throw error; // Re-throw after logging
    }
}
exports.getOrderItems = getOrderItems;
// You could add a self-executing function here for quick testing:
// (async () => {
//     if (process.argv[1] === new URL(import.meta.url).pathname) { // Only run if executed directly
//         try {
//             // Example: Test getting order items for a specific order
//             // const testOrderId = 'YOUR_TEST_ORDER_ID'; // Replace with a real order ID for testing
//             // if (testOrderId !== 'YOUR_TEST_ORDER_ID') {
//             //     await getOrderItems(testOrderId);
//             // } else {
//             //     console.log("Skipping getOrderItems test, please provide a test order ID.");
//             //     await getMarketplaceParticipations(); // Fallback to marketplace test
//             // }
//              await getMarketplaceParticipations(); // Default test
//         } catch (e) {
//             console.error("Test run failed.");
//         }
//     }
// })();
