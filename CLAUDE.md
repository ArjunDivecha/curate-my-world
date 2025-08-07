# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Squirtle** is an AI-powered personalized event curation system that analyzes user conversations to deliver hyper-personalized event recommendations. The system consists of:

- **Frontend**: React + TypeScript application built with Vite, using shadcn/ui components
- **Backend API**: Node.js Express server that aggregates events from 5 data sources
- **Supabase**: Database and edge functions for data persistence and additional processing
- **AI Integration**: Claude Sonnet 4 for conversation analysis and event personalization

## Quick Start Commands

### Development Server
```bash
# Start both frontend and backend
npm run start
# OR use the comprehensive startup script
./scripts/start-all.sh

# Individual services
npm run dev              # Frontend only (port 8766)
npm run start:frontend   # Frontend via script
npm run start:backend    # Backend via script

# Backend only
cd curate-events-api && npm run dev  # Backend only (port 8765)
```

### Build & Deployment
```bash
npm run build           # Production build
npm run build:dev       # Development build
npm run preview         # Preview production build
```

### Code Quality
```bash
npm run lint            # Frontend ESLint
cd curate-events-api && npm run lint  # Backend ESLint
```

### Port Management
```bash
npm run port:status     # Check port usage
npm run port:cleanup    # Kill processes on default ports
npm run stop           # Clean shutdown
```

### Testing
```bash
# Backend testing
cd curate-events-api
npm test               # Run Jest tests
npm run test:watch     # Watch mode
npm run test:integration  # Integration tests

# API Health Checks
curl http://127.0.0.1:8765/api/health
curl http://127.0.0.1:8765/api/health/deep
```

## Architecture Overview

### Frontend Architecture (`src/`)
- **Vite + React 18**: Modern build system with fast hot reload
- **TypeScript**: Full type safety with strict configuration
- **Routing**: React Router v6 with lazy loading
- **State Management**: React Query for server state, React hooks for local state
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Forms**: React Hook Form with Zod validation

**Key Components**:
- `Dashboard.tsx`: Main application dashboard with event display
- `WeeklyCalendar.tsx`: Calendar view for event scheduling
- `EventCard.tsx`: Individual event display with metadata
- `SuggestedCategories.tsx`: AI-powered category suggestions
- `PreferencesModal.tsx`: User preference configuration

### Backend Architecture (`curate-events-api/`)
- **Express.js**: RESTful API server with middleware stack
- **Multi-Source Integration**: 5 concurrent data source clients
- **AI Categorization**: Intelligent event categorization with venue learning
- **Security**: Helmet, CORS, rate limiting, input validation
- **Logging**: Winston with structured logging and request tracing

**Key Modules**:
- `src/clients/`: Data source integrations (Perplexity, Exa, PredictHQ, SerpAPI, Apyflux)
- `src/pipeline/EventPipeline.js`: Multi-source orchestration and processing
- `src/parsers/EventParser.js`: AI-powered event categorization
- `src/managers/`: Venue learning and category management
- `src/utils/eventDeduplicator.js`: Cross-source duplicate detection

### Supabase Integration
- **Database**: PostgreSQL with RLS policies for user data
- **Edge Functions**: Serverless functions for event processing
- **Real-time**: Live event updates via websockets
- **Auth**: User authentication and session management

## Development Workflow

### Environment Setup
1. **Frontend Environment**: Configure `.env` in project root for AI features
2. **Backend Environment**: Configure `curate-events-api/.env` for API keys
3. **Supabase**: Configure via `supabase/config.toml`

### Required Environment Variables
```bash
# Frontend (.env in root)
ANTHROPIC_API_KEY=         # For conversation analysis
VITE_SUPABASE_URL=         # Supabase project URL  
VITE_SUPABASE_ANON_KEY=    # Supabase anonymous key

# Backend (curate-events-api/.env)
PERPLEXITY_API_KEY=        # AI-powered event search
EXA_API_KEY=               # Web search for events
PREDICTHQ_API_KEY=         # Event impact predictions
SERPAPI_API_KEY=           # Google Events integration
APYFLUX_API_KEY=           # Event database (currently issues)
NODE_ENV=development
PORT=8765
HOST=127.0.0.1
```

### Port Configuration
- **Frontend**: 8766 (Vite dev server)
- **Backend**: 8765 (Express API)
- **Supabase**: 54321 (local development)

### Code Organization Patterns

#### Frontend Patterns
- **Components**: Organized by feature in `src/components/`
- **UI Components**: Reusable primitives in `src/components/ui/`
- **Hooks**: Custom hooks in `src/hooks/`
- **Utils**: Pure functions in `src/lib/` and `src/utils/`
- **Types**: Centralized in `src/integrations/supabase/types.ts`

#### Backend Patterns
- **Route Handlers**: RESTful endpoints in `src/routes/`
- **Business Logic**: Domain services in `src/managers/`
- **External APIs**: Client abstractions in `src/clients/`
- **Utilities**: Pure functions in `src/utils/`
- **Configuration**: Environment-based config in `src/utils/config.js`

### Key Design Principles

#### Multi-Source Event Aggregation
The system integrates 5 data sources in parallel:
1. **Perplexity API**: AI-curated events with context understanding
2. **Exa API**: Web search for comprehensive event discovery
3. **PredictHQ**: Event impact and attendance predictions
4. **SerpAPI**: Google Events integration with location accuracy
5. **Apyflux**: Event database (currently experiencing API issues)

#### AI-Powered Categorization
- **Content Analysis**: NLP processing of event titles and descriptions
- **Venue Learning**: Location-specific venue-category associations
- **Confidence Scoring**: Threshold-based recategorization (60% minimum)
- **Global Patterns**: Universal venue type detection across 700+ patterns

#### Data Quality Management
- **Deduplication**: Cross-source duplicate detection and merging
- **Location Filtering**: Geographic validation with 50km radius
- **URL Extraction**: Comprehensive event URL extraction from descriptions
- **Validation**: Schema validation and error handling at all levels

## Testing Strategy

### Backend Testing
- **Unit Tests**: Jest framework for individual components
- **Integration Tests**: API endpoint testing with supertest
- **Health Checks**: Deep health monitoring across all data sources
- **Categorization Tests**: Validation of AI categorization accuracy

### Frontend Testing
- **Component Testing**: React Testing Library for UI components
- **Type Safety**: TypeScript strict mode with comprehensive coverage
- **Build Validation**: Vite build process with error reporting

### Manual Testing Workflows
```bash
# Test multi-source event fetching
curl "http://127.0.0.1:8765/api/events/music?location=San%20Francisco&limit=10"

# Test AI categorization directly
cd curate-events-api && node test-categorization.js

# Validate geographic filtering
node test-location-filtering.js

# Check venue learning statistics
curl "http://127.0.0.1:8765/api/venue-stats"
```

## Common Development Tasks

### Adding New Event Sources
1. Create client in `curate-events-api/src/clients/`
2. Add integration to `EventPipeline.js`
3. Update environment configuration
4. Add tests and documentation

### Modifying Event Categories
1. Update category patterns in `CategoryManager.js`
2. Modify venue learning in `VenueManager.js`
3. Test categorization accuracy
4. Update frontend category displays

### UI Component Development
1. Use shadcn/ui primitives from `src/components/ui/`
2. Follow Tailwind utility-first patterns
3. Implement proper TypeScript interfaces
4. Add to Storybook if complex component

### Database Schema Changes
1. Create migration in `supabase/migrations/`
2. Update TypeScript types
3. Test with local Supabase instance
4. Deploy via Supabase CLI

## Performance Considerations

### Frontend Optimization
- **Code Splitting**: Route-based lazy loading
- **Bundle Analysis**: Vite rollup bundle analyzer
- **Asset Optimization**: Image compression and lazy loading
- **Caching**: React Query for server state caching

### Backend Optimization
- **Parallel Processing**: Concurrent API calls to data sources
- **Response Caching**: Intelligent caching of event data
- **Rate Limiting**: Protection against API abuse
- **Memory Management**: Efficient data structures for large datasets

### Response Time Benchmarks
- **SerpAPI**: ~167ms (fastest)
- **PredictHQ**: ~700ms (good)
- **Exa**: ~3.6s (acceptable)
- **Perplexity**: ~22s (AI processing, high quality)

## Security Guidelines

### API Security
- **Environment Variables**: All API keys in `.env` files (excluded from git)
- **Input Validation**: Zod schemas for all API inputs
- **Rate Limiting**: Express rate limiting with IP-based throttling
- **CORS**: Configured origins for cross-origin requests
- **Headers**: Helmet middleware for security headers

### Data Protection
- **Supabase RLS**: Row-level security for user data
- **Authentication**: JWT-based session management
- **Logging**: Structured logging without sensitive data exposure

## Troubleshooting Guide

### Common Issues
1. **Port Conflicts**: Use `npm run port:cleanup` to free ports
2. **API Key Errors**: Verify all environment variables are set
3. **Build Failures**: Check TypeScript errors and dependencies
4. **CORS Issues**: Verify frontend/backend port configuration

### Debug Commands
```bash
# Check system health
curl http://127.0.0.1:8765/api/health/deep

# Monitor logs
tail -f curate-events-api/logs/combined.log

# Test individual data sources
cd curate-events-api && node debug-categorization.js
```

### Performance Monitoring
- **Backend Logs**: Winston structured logging in `curate-events-api/logs/`
- **Health Endpoints**: Real-time system status via `/api/health`
- **Source Statistics**: Response time monitoring per data source
- **Categorization Analytics**: AI performance metrics in API responses

## Additional Resources

- **Main Documentation**: `README.md` - Comprehensive system overview
- **Environment Setup**: `ENVIRONMENT.md` - Detailed configuration guide
- **Port Management**: `PORT_MANAGEMENT.md` - Port conflict resolution
- **Product Requirements**: `PRD.md` - Business requirements and features
- **Supabase Functions**: `supabase/functions/` - Edge function implementations