/**
 * server.js
 * 
 * Main Express server for the Curate Events API
 * Simple, reliable event collection using proven Perplexity patterns
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './src/utils/config.js';
import { createLogger, logRequest, logResponse, logError } from './src/utils/logger.js';
import healthRoutes from './src/routes/health.js';
import eventsRoutes from './src/routes/events.js';
import personalizationRoutes from './src/routes/personalization.js';

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
  
  app.use(rateLimit({
    windowMs: config.rateLimiting.windowMs,
    max: config.rateLimiting.maxRequests,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
  }));
  
  logger.info('Rate limiting enabled', {
    windowMs: config.rateLimiting.windowMs,
    maxRequests: config.rateLimiting.maxRequests
  });
}

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/personalization', personalizationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Curate Events API',
    version: '1.0.0',
    description: 'Simple, reliable event collection using Perplexity AI',
    endpoints: {
      health: '/api/health',
      healthDeep: '/api/health/deep',
      events: '/api/events/:category/combined',
      eventsByCategory: '/api/events/:category/compare',
      personalization: '/api/personalization/curate',
      feedback: '/api/personalization/feedback'
    },
    documentation: 'https://github.com/your-repo/curate-events-api'
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'Route not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/health/deep'
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
    rateLimiting: config.rateLimiting.enabled,
    perplexityModel: config.perplexity.model
  });
  
  console.log(`
🎭 Curate Events API
================================
🚀 Server running on: http://${config.host}:${config.port}
🌍 Environment: ${config.nodeEnv}
🔑 Perplexity API: ${config.perplexityApiKey ? '✅ Configured' : '❌ Missing'}
🛡️  CORS Origins: ${JSON.stringify(config.corsOrigins)}
📊 Health Check: http://${config.host}:${config.port}/api/health
🔍 Deep Health: http://${config.host}:${config.port}/api/health/deep
================================
  `);
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