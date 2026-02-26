/**
 * server.js
 * 
 * Main Express server for the Curate Events API
 * Bay Area event curation API with Ticketmaster + Venue Scraper
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './src/utils/config.js';
import { createLogger, logRequest, logResponse, logError } from './src/utils/logger.js';
import healthRoutes from './src/routes/health.js';
import eventsRoutes from './src/routes/events.js';
import rulesRoutes from './src/routes/rules.js';
import previewRoutes from './src/routes/preview.js';
import listsRoutes from './src/routes/lists.js';
import { startVenueRefreshScheduler } from './src/utils/venueRefreshScheduler.js';

// Get directory paths for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

const app = express();
const logger = createLogger('Server');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow for API usage
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request
  logRequest(logger, req, 'incoming');
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    logResponse(logger, res, 'completed', duration);
    originalEnd.apply(this, args);
  };
  
  next();
});

// Rate limiting (production only)
if (config.rateLimiting.enabled) {
  const rateLimit = (await import('express-rate-limit')).default;
  const rateLimitSkipMatchers = (config.rateLimiting.skipPaths || []).map((pattern) => {
    const trimmed = String(pattern || '').trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('*')) {
      const prefix = trimmed.slice(0, -1);
      return (pathValue) => pathValue.startsWith(prefix);
    }
    return (pathValue) => pathValue === trimmed;
  }).filter(Boolean);
  
  app.use(rateLimit({
    windowMs: config.rateLimiting.windowMs,
    max: config.rateLimiting.maxRequests,
    skip: (req) => {
      const pathValue = req.path || '';
      return rateLimitSkipMatchers.some((matcher) => matcher(pathValue));
    },
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
  }));
  
  logger.info('Rate limiting enabled', {
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.maxRequests,
    skipPaths: config.rateLimiting.skipPaths
  });
}

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/preview', (req, res, next) => { logger.info('Preview route hit pre-router'); next(); }, previewRoutes);
app.use('/api/lists', listsRoutes);

// ============================================
// STATIC FILE SERVING (React Frontend)
// ============================================
// In production (Railway), serve the built React app
const frontendDistPath = path.join(__dirname, '../dist');

// Serve static files from the React build
app.use(express.static(frontendDistPath));

// API info endpoint (only responds to exact /api path)
app.get('/api', (req, res) => {
  res.json({
    name: 'Curate Events API',
    version: '1.0.0',
    description: 'Bay Area event curation with Ticketmaster + Venue Scraper',
    endpoints: {
      health: '/api/health',
      healthDeep: '/api/health/deep',
      events: '/api/events/:category/combined',
      eventsByCategory: '/api/events/:category/compare',
      rules: '/api/rules',
      lists: '/api/lists'
    },
    documentation: 'https://github.com/ArjunDivecha/curate-my-world'
  });
});

// SPA fallback: serve index.html for any non-API routes
// This enables React Router to handle client-side routing
app.get('*', (req, res, next) => {
  // Skip if this is an API route (let 404 handler catch it)
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  // Serve React app for all other routes
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      // If index.html doesn't exist, show API info (development mode)
      res.json({
        name: 'Curate Events API',
        version: '1.0.0',
        note: 'Frontend not built. Run "npm run build" in the root directory.',
        endpoints: {
          health: '/api/health',
          healthDeep: '/api/health/deep'
        }
      });
    }
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  logger.warn('API route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'API route not found',
    message: `${req.method} ${req.originalUrl} is not a valid API endpoint`,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/health/deep',
      'GET /api/events/:category'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logError(logger, err, {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    ip: req.ip
  });

  const statusCode = err.statusCode || err.status || 500;
  const message = config.isDevelopment ? err.message : 'Internal server error';
  
  res.status(statusCode).json({
    error: message,
    ...(config.isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(config.port, config.host, () => {
  logger.info('Curate Events API started', {
    port: config.port,
    host: config.host,
    environment: config.nodeEnv,
    cors: config.corsOrigins,
    rateLimiting: config.rateLimiting.enabled
  });
  
  console.log(`
🎭 Curate Events API
================================
🚀 Server running on: http://${config.host}:${config.port}
🌍 Environment: ${config.nodeEnv}
🔑 Anthropic API: ${config.anthropicApiKey ? '✅ Configured' : '❌ Missing'}
🛡️  CORS Origins: ${JSON.stringify(config.corsOrigins)}
📊 Health Check: http://${config.host}:${config.port}/api/health
🔍 Deep Health: http://${config.host}:${config.port}/api/health/deep
================================
  `);

  // Daily scheduled refresh (6am America/Los_Angeles) for venue scraper cache.
  // Uses Postgres advisory lock, so it is safe even if multiple app instances exist.
  startVenueRefreshScheduler();
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

export default app;
