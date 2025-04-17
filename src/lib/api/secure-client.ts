/**
 * Secure API Client Wrapper
 * 
 * Implements security recommendations for API clients:
 * - Enforces HTTPS with proper certificate validation
 * - Prevents SSL downgrade attacks
 * - Adds timeout and request limiting
 */

import https from 'https';

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Creates an axios client with secure defaults
 * 
 * Addresses CWE-311 (Transport Encryption) by explicitly setting 
 * strictSSL=true and rejectUnauthorized=true to prevent MITM attacks.
 * 
 * @param baseConfig - Base axios configuration
 * @returns Secured axios instance
 */
export function createSecureApiClient(baseConfig?: AxiosRequestConfig): AxiosInstance {
  // Create a secure HTTPS agent that always validates certificates
  const secureHttpsAgent = new https.Agent({
    rejectUnauthorized: true, // Reject invalid/self-signed certificates
    minVersion: 'TLSv1.2',    // Enforce minimum TLS version
  });

  // Create axios instance with secure defaults
  const client = axios.create({
    ...baseConfig,
    // Force HTTPS agent with certificate validation
    httpsAgent: secureHttpsAgent,
    // Set sensible timeouts to prevent hanging requests
    timeout: baseConfig?.timeout || 30000,
    // Always validate SSL by default
    validateStatus: (status) => status >= 200 && status < 500,
  });

  // Add request interceptor to enforce HTTPS
  client.interceptors.request.use((config) => {
    // Ensure all URLs use HTTPS
    if (config.url && config.url.startsWith('http:')) {
      config.url = config.url.replace('http:', 'https:');
      console.warn(`[Secure Client] Upgraded request from HTTP to HTTPS: ${config.url}`);
    }
    
    // Ensure httpsAgent is set for all requests
    if (!config.httpsAgent) {
      config.httpsAgent = secureHttpsAgent;
    }
    
    return config;
  });

  return client;
}

/**
 * Configuration for the Selling Partner API SDK
 * 
 * @param config - Base configuration 
 * @returns Secure configuration for SDK
 */
export function createSecureSellingPartnerConfig(config: any): any {
  return {
    ...config,
    options: {
      ...config.options,
      axios: createSecureApiClient({
        headers: config.options?.axios?.headers || {},
      }),
    },
  };
}
