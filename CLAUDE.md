# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Squirtle** is an AI-powered personalized event curation system that analyzes user conversations to deliver hyper-personalized event recommendations. The system consists of:

- **Frontend**: React + TypeScript application built with Vite, using shadcn/ui components (port 8766)
- **Backend API**: Node.js Express server that aggregates events from 5 data sources (port 8765)
- **Supabase**: Database and edge functions for data persistence and additional processing (port 54321)
- **AI Integration**: Claude Sonnet 4 for conversation analysis and event personalization

## Essential Commands

### Development
```bash
# Start entire system (recommended)
npm run start                    # Uses start-all.sh script
./scripts/start-all.sh          # Direct script execution

# Individual services
npm run dev                     # Frontend only (Vite dev server)
cd curate-events-api && npm run dev  # Backend only (Node.js with --watch)

# Alternative service scripts
npm run start:frontend          # Frontend via script
npm run start:backend           # Backend via script
```

### Testing & Health Checks
```bash
# Backend testing
cd curate-events-api
npm test                       # Run Jest tests
npm run test:watch            # Watch mode
npm run test:integration      # Integration tests

# System health validation
curl http://127.0.0.1:8765/api/health      # Basic health check
curl http://127.0.0.1:8765/api/health/deep # Deep health with all data sources

# Test multi-source event fetching
curl "http://127.0.0.1:8765/api/events/music?location=San%20Francisco&limit=10"
```

### Build & Deployment
```bash
npm run build                  # Production build
npm run build:dev             # Development build
npm run preview               # Preview production build
```

### Code Quality
```bash
npm run lint                   # Frontend ESLint
cd curate-events-api && npm run lint  # Backend ESLint
```

### Port Management
```bash
npm run port:status           # Check port usage
npm run port:cleanup         # Kill processes on default ports (8765, 8766)
npm run stop                 # Clean shutdown
```

### Utility Scripts
```bash
npm run bench:providers       # Benchmark data source performance
npm run export:events        # Export events data
```

## Architecture Overview

### Frontend Architecture (`src/`)
- **Build System**: Vite + React 18 with TypeScript strict mode
- **Routing**: React Router v6 with route-based lazy loading
- **State Management**: React Query for server state, React hooks for local state
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties
- **Forms**: React Hook Form with Zod validation

**Key Components**:
- `Dashboard.tsx`: Main application dashboard with event display
- `WeeklyCalendar.tsx`: Calendar view for event scheduling
- `EventCard.tsx`: Individual event display with metadata
- `SuggestedCategories.tsx`: AI-powered category suggestions
- `PreferencesModal.tsx`: User preference configuration

### Backend Architecture (`curate-events-api/`)
- **Express.js**: RESTful API server with comprehensive middleware stack
- **Multi-Source Integration**: 5 concurrent data source clients with parallel processing
- **AI Categorization**: Intelligent event categorization with venue learning
- **Security**: Helmet, CORS, rate limiting, input validation with Zod schemas
- **Logging**: Winston with structured logging and request tracing

**Critical Modules**:
- `src/clients/`: Data source integrations (Perplexity, Exa, PredictHQ, SerpAPI, Apyflux)
- `src/pipeline/EventPipeline.js`: Multi-source orchestration and processing
- `src/parsers/EventParser.js`: AI-powered event categorization
- `src/managers/`: Venue learning and category management
- `src/utils/eventDeduplicator.js`: Cross-source duplicate detection
- `src/utils/config.js`: Environment-based configuration management

### Data Sources Status & Performance
1. **Perplexity API** ✅ - AI-curated events (~22s processing, high quality)
2. **SerpAPI** ✅ - Google Events integration (~167ms, fastest)
3. **PredictHQ** ✅ - Event intelligence and predictions (~700ms)
4. **Exa API** ✅ - AI web search (~3.6s processing)
5. **Apyflux API** ⚠️ - Event database (currently experiencing API issues)

### Supabase Integration
- **Database**: PostgreSQL with Row Level Security (RLS) policies
- **Edge Functions**: Serverless functions for event processing (`supabase/functions/`)
- **Real-time**: Live event updates via websockets
- **Auth**: JWT-based session management
- **Configuration**: `supabase/config.toml`

## Environment Configuration

### Required Environment Variables

**Frontend (`.env` in project root)**:
```bash
ANTHROPIC_API_KEY=              # For conversation analysis
VITE_SUPABASE_URL=             # Supabase project URL
VITE_SUPABASE_ANON_KEY=        # Supabase anonymous key
```

**Backend (`curate-events-api/.env`)**:
```bash
# Core configuration
NODE_ENV=development
PORT=8765
HOST=127.0.0.1

# Data source API keys
PERPLEXITY_API_KEY=            # Required for startup
EXA_API_KEY=                   # AI web search
PREDICTHQ_API_KEY=             # Event predictions
SERPAPI_API_KEY=               # Google Events (not SERPER)
APYFLUX_API_KEY=               # Event database
APYFLUX_APP_ID=                # Apyflux app identifier
APYFLUX_CLIENT_ID=             # Apyflux client identifier

# Optional integrations
TICKETMASTER_CONSUMER_KEY=     # Ticketmaster integration
TICKETMASTER_CONSUMER_SECRET=  # Ticketmaster secret
```

**Security Notes**:
- All API keys stored in `.env` files (never committed to git)
- Use `curate-events-api/.env.example` as template
- System validates required keys on startup
- Only Perplexity API key is critical for basic functionality

## Key Design Principles

### Multi-Source Event Aggregation
The system processes 5 data sources concurrently with intelligent deduplication:
- **Parallel Processing**: All sources called simultaneously for performance
- **Deduplication**: ~5-10% duplicate rate across sources with smart merging
- **Error Handling**: Graceful degradation when individual sources fail
- **Performance Monitoring**: Response time tracking per source

### AI-Powered Categorization
- **Content Analysis**: NLP processing of event titles and descriptions
- **Venue Learning**: Location-specific venue-category associations (700+ patterns)
- **Confidence Scoring**: Threshold-based recategorization (60% minimum confidence)
- **Category Management**: Centralized in `CategoryManager.js` and `VenueManager.js`

### Data Quality Management
- **Geographic Filtering**: 50km radius validation from requested location
- **URL Extraction**: Comprehensive event URL extraction from descriptions
- **Schema Validation**: Zod schemas for all API inputs and outputs
- **Error Boundary**: Comprehensive error handling at all pipeline levels

## Code Organization Patterns

### Frontend Structure (`src/`)
```
src/
├── components/           # Feature-organized components
│   ├── ui/              # Reusable shadcn/ui primitives
│   └── [feature]/       # Feature-specific components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
├── utils/               # Pure helper functions
└── integrations/
    └── supabase/        # Supabase types and client
        └── types.ts     # Centralized TypeScript types
```

### Backend Structure (`curate-events-api/src/`)
```
src/
├── clients/             # External API integrations
├── managers/            # Business logic (Category, Venue)
├── parsers/             # Event processing (AI categorization)
├── pipeline/            # Multi-source orchestration
├── routes/              # Express route handlers
└── utils/               # Configuration and utilities
    ├── config.js        # Environment-based configuration
    └── eventDeduplicator.js  # Cross-source deduplication
```

## Development Workflow

### Before Making Changes
1. **Read README.md** for current system status and recent updates
2. **Check API health**: `curl http://127.0.0.1:8765/api/health/deep`
3. **Verify data sources**: Ensure 4-5 sources returning events
4. **Monitor performance**: Check processing times and error rates
5. **Environment validation**: Confirm all required API keys are configured

### Common Development Tasks

#### Adding New Event Sources
1. Create client in `curate-events-api/src/clients/`
2. Add integration to `EventPipeline.js`
3. Update `config.js` for new environment variables
4. Add validation in `validateConfig()` function
5. Update documentation and health checks

#### Modifying Event Categories
1. Update patterns in `CategoryManager.js`
2. Modify venue learning in `VenueManager.js`
3. Test with `node test-categorization.js`
4. Update frontend category displays

#### Database Schema Changes
1. Create migration: `supabase migration new [name]`
2. Update TypeScript types in `src/integrations/supabase/types.ts`
3. Test with local Supabase: `supabase start`
4. Deploy: `supabase db push`

## Performance Optimization

### Response Time Benchmarks
- **SerpAPI**: ~167ms (fastest, Google Events)
- **PredictHQ**: ~700ms (good performance)
- **Exa**: ~3.6s (acceptable for AI search)
- **Perplexity**: ~22s (AI processing, highest quality)

### System Monitoring
- **Memory Usage**: ~26MB backend baseline
- **Event Coverage**: 15-20 events per request from active sources
- **Deduplication Rate**: 5-10% across all sources
- **Health Monitoring**: Real-time via `/api/health` endpoints

## Security Guidelines

### API Security
- **Environment Variables**: All credentials in `.env` files (git-ignored)
- **Input Validation**: Zod schemas for all API inputs
- **Rate Limiting**: Express rate limiting with IP-based throttling
- **CORS**: Environment-specific origin configuration
- **Security Headers**: Helmet middleware for HTTP security

### Data Protection
- **Supabase RLS**: Row-level security policies for user data
- **JWT Authentication**: Secure session management
- **Logging Security**: No sensitive data in Winston logs

## Troubleshooting

### Common Issues
1. **Port Conflicts**: Run `npm run port:cleanup` to free ports 8765/8766
2. **API Key Errors**: Check `curate-events-api/.env` configuration
3. **Build Failures**: Verify TypeScript errors with `npm run lint`
4. **Data Source Failures**: Monitor via `/api/health/deep` endpoint

### Debug Commands
```bash
# System diagnostics
curl http://127.0.0.1:8765/api/health/deep
tail -f curate-events-api/logs/combined.log

# Test individual components
cd curate-events-api
node test-categorization.js      # Test AI categorization
node test-location-filtering.js  # Test geographic filtering
```

### Performance Monitoring
- **Backend Logs**: Winston structured logging in `curate-events-api/logs/`
- **Health Endpoints**: Real-time system status and source statistics
- **Categorization Analytics**: AI performance metrics in API responses

## Critical Files (Require Permission Before Modification)
- `curate-events-api/.env` - API keys and configuration
- `curate-events-api/src/utils/config.js` - Configuration logic
- `curate-events-api/src/routes/events.js` - Multi-source integration
- `supabase/migrations/` - Database schema changes
- `package.json` scripts - Build and deployment configuration

## Additional Resources

- **README.md**: Comprehensive system overview and current status
- **ENVIRONMENT.md**: Detailed environment setup guide
- **PORT_MANAGEMENT.md**: Port conflict resolution procedures
- **PRD.md**: Business requirements and product specifications
- **supabase/functions/**: Edge function implementations