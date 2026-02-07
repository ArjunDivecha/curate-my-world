/**
 * config.js
 * 
 * Environment configuration and settings management
 */

import fs from 'fs';
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
  // Railway requires 0.0.0.0 to bind to all interfaces
  port: parseInt(process.env.PORT) || 8765,
  host: process.env.HOST || (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1'),
  
  // API keys - ALL from environment variables
  perplexityApiKey: process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  apyfluxApiKey: process.env.APYFLUX_API_KEY,
  apyfluxAppId: process.env.APYFLUX_APP_ID,
  apyfluxClientId: process.env.APYFLUX_CLIENT_ID,
  exaApiKey: process.env.EXA_API_KEY,
  serperApiKey: process.env.SERPER_API_KEY,
  ticketmasterConsumerKey: process.env.TICKETMASTER_CONSUMER_KEY,
  ticketmasterConsumerSecret: process.env.TICKETMASTER_CONSUMER_SECRET,
  googleMapsApiKey: process.env.GOOGLE_MAPS_PLATFORM_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
  
  // Logging
  logLevel: process.env.LOG_LEVEL || (nodeEnv === 'development' ? 'debug' : 'info'),
  
  // CORS configuration - allow all origins in development for browser preview proxy support
  corsOrigins: nodeEnv === 'development' 
    ? true  // Allow all origins in development (browser preview uses random proxy ports)
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
    maxLimit: 500,
    
    // Event processing
    maxEventsPerCategory: 100,
    defaultCategories: ['theatre', 'music', 'museums'],
    
    // Response format
    includeMetadata: true,
    includeDebugInfo: nodeEnv === 'development'
  },

  // Super-Hybrid experiment integration (no frontend changes)
  superHybrid: {
    url: process.env.SUPER_HYBRID_URL || 'http://127.0.0.1:8799',
    enabledByDefault: ['1','true','yes'].includes(String(process.env.SUPER_HYBRID_DEFAULT || '').toLowerCase())
  },

  // Source toggles (defaults)
  sources: {
    // Disable external paid providers by default; can be overridden per-request
    // Also disable Perplexity by default when measuring alternatives
    disablePerplexityByDefault: true,
    disableTicketmasterByDefault: false,
    disablePplxSearchByDefault: false
  },
  
  // Perplexity API defaults
  perplexity: {
    model: 'sonar-reasoning',
    maxTokens: 16000,  // Increased to get more events like direct Perplexity testing
    temperature: 0.1,
    retryAttempts: 2,
    retryDelay: 1000 // ms
  },
  
  // Venue scraper configuration
  venueScraper: {
    jinaReaderUrl: process.env.JINA_READER_URL || 'https://r.jina.ai',
    venueEventsCachePath: path.resolve(__dirname, '../../../data/venue-events-cache.json'),
    venueRegistryPath: path.resolve(__dirname, '../../../data/venue-registry.json')
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
  // Ticketmaster is the backbone - required for startup
  const critical = ['ticketmasterConsumerKey'];
  const missingCritical = critical.filter(key => !config[key]);

  if (missingCritical.length > 0) {
    throw new Error(`Missing required API keys: ${missingCritical.join(', ')}. Ticketmaster is the primary event source.`);
  }

  // Warn (do not block) when optional provider keys are missing
  const optional = [
    'perplexityApiKey', 'anthropicApiKey', 'exaApiKey', 'serperApiKey',
    'ticketmasterConsumerSecret'
  ];
  const missingOptional = optional.filter(key => !config[key]);
  if (missingOptional.length > 0) {
    console.warn(`Optional provider keys missing (features disabled by default): ${missingOptional.join(', ')}`);
  }

  // Warn if venue scraper cache is missing
  try {
    if (!fs.existsSync(config.venueScraper.venueEventsCachePath)) {
      console.warn('Venue events cache not found. Run "npm run scrape:venues" to populate it.');
    }
  } catch {}

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
