/**
 * config.js
 * 
 * Environment configuration and settings management
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from process CWD .env, then fallback to curate-events-api/.env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Attempt to also load env from the package's own .env (when server is started from repo root)
try {
  const localEnvPath = path.resolve(__dirname, '../../.env');
  dotenv.config({ path: localEnvPath });
} catch {}

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Application configuration
 */
export const config = {
  // Environment
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  
  // Server configuration
  port: parseInt(process.env.PORT) || 8765,
  host: process.env.HOST || '127.0.0.1',
  
  // API keys - ALL from environment variables
  perplexityApiKey: process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY,
  apyfluxApiKey: process.env.APYFLUX_API_KEY,
  apyfluxAppId: process.env.APYFLUX_APP_ID,
  apyfluxClientId: process.env.APYFLUX_CLIENT_ID,
  predictHQApiKey: process.env.PREDICTHQ_API_KEY,
  exaApiKey: process.env.EXA_API_KEY,
  serperApiKey: process.env.SERPER_API_KEY,
  ticketmasterConsumerKey: process.env.TICKETMASTER_CONSUMER_KEY,
  ticketmasterConsumerSecret: process.env.TICKETMASTER_CONSUMER_SECRET,
  
  // Logging
  logLevel: process.env.LOG_LEVEL || (nodeEnv === 'development' ? 'debug' : 'info'),
  
  // CORS configuration
  corsOrigins: nodeEnv === 'development' 
    ? ['http://localhost:8766', 'http://127.0.0.1:8766', 'http://localhost:8767', 'http://127.0.0.1:8767', 'http://localhost:8768', 'http://127.0.0.1:8768']  // Frontend ports
    : (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['*']),
  
  // Rate limiting
  rateLimiting: {
    enabled: nodeEnv === 'production',
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100 // requests per window
  },
  
  // API configuration
  api: {
    // Request timeouts
    timeout: 60000, // 60 seconds
    
    // Default pagination
    defaultLimit: 50,
    maxLimit: 200,
    
    // Event processing
    maxEventsPerCategory: 100,
    defaultCategories: ['theatre', 'music', 'museums'],
    
    // Response format
    includeMetadata: true,
    includeDebugInfo: nodeEnv === 'development'
  },
  
  // Perplexity API defaults
  perplexity: {
    model: 'sonar-reasoning',
    maxTokens: 16000,  // Increased to get more events like direct Perplexity testing
    temperature: 0.1,
    retryAttempts: 2,
    retryDelay: 1000 // ms
  },
  
  // File paths
  paths: {
    root: path.resolve(__dirname, '../../'),
    config: path.resolve(__dirname, '../../config'),
    logs: path.resolve(__dirname, '../../logs'),
    tests: path.resolve(__dirname, '../../tests')
  }
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const required = [
    'perplexityApiKey',
    'apyfluxApiKey', 
    'apyfluxAppId', 
    'apyfluxClientId',
    'predictHQApiKey',
    'exaApiKey',
    'serperApiKey'
  ];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required API keys: ${missing.join(', ')}`);
  }
  
  // Validate API key formats
  if (config.perplexityApiKey && !config.perplexityApiKey.startsWith('pplx-')) {
    console.warn('Warning: Perplexity API key format may be invalid (should start with pplx-)');
  }
  
  return true;
}

/**
 * Get configuration for specific environment
 * @param {string} env - Environment name
 * @returns {object} Environment-specific configuration
 */
export function getEnvironmentConfig(env = nodeEnv) {
  const envConfigs = {
    development: {
      logLevel: 'debug',
      cors: {
        origin: true,
        credentials: true
      },
      rateLimiting: {
        enabled: false
      }
    },
    
    production: {
      logLevel: 'info',
      cors: {
        origin: config.corsOrigins,
        credentials: true
      },
      rateLimiting: {
        enabled: true,
        windowMs: 15 * 60 * 1000,
        maxRequests: 100
      }
    },
    
    test: {
      logLevel: 'error',
      port: 0, // Random port for testing
      cors: {
        origin: true
      },
      rateLimiting: {
        enabled: false
      }
    }
  };

  return {
    ...config,
    ...envConfigs[env]
  };
}

export default config;
