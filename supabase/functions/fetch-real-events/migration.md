User approved Claude's plan:
  ⎿  Comprehensive Plan: Simple & Flexible Perplexity Event Collection System

     Executive Summary

     Replace the problematic Supabase Edge Function approach with a simple, reliable Node.js API that uses proven direct Perplexity patterns. This 
     eliminates the 1-event bottleneck while maintaining flexibility for future changes.

     Architecture Overview

     CURRENT (BROKEN):
     Frontend --> Supabase Edge Function --> Perplexity API
                  (Returns only 1 event)

     TARGET (WORKING):
     Frontend --> Node.js API Server --> Perplexity API
                  (Returns 30+ events like proven tests)

     System Architecture

     3-Tier Modular Design

     Tier 1: Frontend Layer
     - React/HTML interface for event display
     - Calls REST API endpoints for event data
     - No direct Perplexity integration (secure API key handling)

     Tier 2: Node.js API Server (Core Logic)
     - Lightweight Express/Fastify server
     - Implements proven Perplexity API patterns
     - Modular event processing pipeline
     - Deployable on Vercel, Railway, or traditional hosting

     Tier 3: Optional Storage Layer
     - JSON files for simple caching
     - Database integration option for future enhancement
     - Not required for MVP - real-time operation

     Core Components

     curate-events-api/
     ├── src/
     │   ├── clients/
     │   │   └── PerplexityClient.js       # Direct API wrapper
     │   ├── parsers/
     │   │   ├── EventParser.js            # Response parsing logic
     │   │   └── ResponseValidator.js      # Validation utilities
     │   ├── managers/
     │   │   └── CategoryManager.js        # Prompt & category configuration
     │   ├── pipeline/
     │   │   └── EventPipeline.js          # Orchestration logic
     │   ├── routes/
     │   │   ├── events.js                 # Event API endpoints
     │   │   └── health.js                 # Health check endpoint
     │   └── utils/
     │       ├── logger.js                 # Structured logging
     │       └── config.js                 # Environment configuration
     ├── config/
     │   ├── categories.json               # Event categories & prompts
     │   └── environments.json             # Environment-specific settings
     ├── tests/
     │   ├── integration/                  # API endpoint tests
     │   └── unit/                         # Component unit tests
     ├── package.json
     ├── server.js                         # Express app entry point
     └── vercel.json                       # Deployment configuration

     Data Flow Architecture

     Frontend Request
           |
           v
     Express Router
           |
           v
     EventPipeline.fetchEvents()
           |
           v
     CategoryManager.getPrompt() ---> PerplexityClient.query()
           |                                    |
           v                                    v
     EventParser.parseResponse() <--- Raw API Response
           |
           v
     ResponseValidator.validate()
           |
           v
     Formatted Event Data --> Frontend

     API Design

     Endpoints

     GET /api/health
     - Returns: { status: "healthy", version: "1.0.0", categories: [...] }

     POST /api/events
     - Request: { location: "San Francisco, CA", categories: ["theatre", "music"], maxEvents: 100 }
     - Response: { success: true, events: [...], metadata: { totalFound: 45, processingTime: "2.3s" } }

     GET /api/events/:category
     - Query params: ?location=San Francisco,CA&maxEvents=50
     - Same response format as POST /api/events

     Event Data Structure

     {
       id: "generated-uuid",
       title: "Event Name",
       description: "Event description",
       category: "theatre",
       venue: "Venue Name",
       address: "123 Main St, San Francisco, CA",
       startDate: "2025-01-15T19:30:00Z",
       endDate: "2025-01-15T22:00:00Z",
       priceRange: { min: 25, max: 75 },
       externalUrl: "https://venue.com/tickets",
       source: "perplexity_api",
       confidence: 0.95
     }

     Configuration-Driven Design

     Category Configuration (config/categories.json)

     {
       "categories": {
         "theatre": {
           "prompt": "get me a list of all the theatre events playing in the bay area over the next 30 days",
           "expectedCount": 30,
           "parsePatterns": ["**Event Name**", "• Event Name"],
           "enabled": true
         },
         "music": {
           "prompt": "Find ALL live music events and concerts in {location} over the next 30 days. Include all venues and genres.",
           "expectedCount": 50,
           "parsePatterns": ["**Event Name**", "- Event Name"],
           "enabled": true
         }
       },
       "defaults": {
         "maxTokens": 8000,
         "temperature": 0.1,
         "model": "sonar-reasoning"
       }
     }

     Implementation Phases

     Phase 1: Foundation Setup (Critical Path)

     1. Create curate-events-api/ project directory
     2. Initialize package.json with dependencies (express, cors, helmet, winston)
     3. Extract working patterns from test-python-replication.js
     4. Build PerplexityClient.js with exact API parameters
     5. Create basic Express server with health endpoint
     6. Test API connectivity and validate 30+ event responses

     Phase 2: Core Processing Pipeline

     1. Implement EventParser.js using successful parsing logic
     2. Create CategoryManager.js with categories.json configuration
     3. Build EventPipeline.js for orchestration
     4. Add comprehensive logging and error handling
     5. Unit test each component with known good data

     Phase 3: API Layer Development

     1. Design REST endpoints (/api/events, /api/health)
     2. Implement request validation and error responses
     3. Add CORS and security middleware
     4. Create integration tests for full API flow
     5. Document API with examples and response formats

     Phase 4: Frontend Integration

     1. Update existing frontend to call new API endpoints
     2. Remove Supabase Edge Function dependencies
     3. Implement loading states and error handling
     4. Test complete data flow from API to UI display
     5. Validate event data structure compatibility

     Phase 5: Production Deployment

     1. Configure Vercel deployment with vercel.json
     2. Set up environment variables and secrets
     3. Deploy to production and test with real traffic
     4. Monitor performance and error rates
     5. Create operational documentation and runbooks

     Migration Strategy

     Current State: Frontend --> Supabase Edge Function --> Perplexity API
     Target State:  Frontend --> Node.js API Server --> Perplexity API

     Migration Steps:
     1. Deploy new API alongside existing system
     2. Add feature flag for API endpoint selection
     3. Test new API with subset of traffic
     4. Gradually migrate categories one by one
     5. Deprecate Supabase Edge Functions after validation

     Testing Strategy

     Unit Tests

     - PerplexityClient.test.js: API call validation, retry logic, error handling
     - EventParser.test.js: Response parsing accuracy, format handling
     - CategoryManager.test.js: Configuration loading, prompt generation
     - ResponseValidator.test.js: Data structure validation, edge cases

     Integration Tests

     - events.route.test.js: Full API endpoint testing
     - pipeline.integration.test.js: End-to-end data flow validation
     - deployment.test.js: Environment configuration verification

     Performance Benchmarks

     - API response time: < 10 seconds per category
     - Parsing accuracy: > 95% event extraction rate
     - Memory usage: < 512MB during processing
     - Error rate: < 1% for valid requests

     Deployment Options

     Vercel (Recommended)

     - Pros: 10-60s execution time, excellent Node.js support, automatic HTTPS
     - Configuration: vercel.json with API routes

     Railway (Alternative)

     - Pros: Always-on server, simple deployment, generous free tier
     - Configuration: railway.json

     Environment Variables Required

     - PERPLEXITY_API_KEY (from user's working key)
     - NODE_ENV (development/production)
     - FRONTEND_URL (CORS configuration)
     - LOG_LEVEL (optional, defaults to 'info')

     Success Validation Criteria

     - Consistently returns 30+ events per category (matching direct tests)
     - API response time under 10 seconds
     - Frontend displays events without data structure changes
     - Error rate below 1% for valid requests
     - Easy configuration changes via categories.json

     Key Benefits

     Simplicity

     - Eliminates Supabase Edge Function complexity
     - Direct API approach with proven patterns
     - Clear separation of concerns

     Flexibility

     - Configuration-driven category management
     - Modular component architecture
     - Multiple deployment options

     Reliability

     - Uses proven working API patterns (40+ events)
     - Comprehensive error handling and logging
     - Graceful degradation strategies

     Future-Proofing

     - Easy to add new event sources
     - Extensible parsing pipeline
     - Database integration ready
     - Scalable deployment options
