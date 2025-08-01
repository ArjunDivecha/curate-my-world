# Project Instructions for Curate My World

## CORE RULES - ALWAYS FOLLOW THESE

### 🔍 Project Context Rule
- **ALWAYS CHECK THE README FIRST** - Before starting any work, read the project README.md to understand:
  - Current system status and architecture
  - Recent changes and updates
  - Data source status (5 APIs: Perplexity, Apyflux, PredictHQ, Exa, SerpAPI)
  - Security configuration and API key setup
  - File locations and system structure

### 📁 Project Structure Understanding
- **Frontend**: React/TypeScript in `/src/` (port 8766)
- **Backend API**: Node.js/Express in `/curate-events-api/` (port 8765)
- **Database**: Supabase in `/supabase/`
- **Configuration**: API keys in `curate-events-api/.env` (NOT in git)

### 🔐 Security Protocol
- **API Keys**: All stored in `curate-events-api/.env` (never commit)
- **Template**: Use `curate-events-api/.env.example` for new setups
- **Validation**: System validates all required keys on startup
- **Collaboration**: Partner needs their own `.env` file with API keys

### 🔌 Data Sources Status
Monitor these 5 data sources in backend API:
1. **Perplexity API** ✅ - AI-powered, ~22s processing
2. **Apyflux API** ⚠️ - Premium service, currently has API issues  
3. **PredictHQ API** ✅ - Event intelligence, ~700ms processing
4. **Exa API** ✅ - AI web search, ~3.6s processing
5. **SerpAPI** ✅ - Google Events, ~167ms processing

### 🧪 Testing Protocol
- **Health Check**: `curl http://127.0.0.1:8765/api/health`
- **API Test**: `curl "http://127.0.0.1:8765/api/events/music?location=San%20Francisco&limit=10"`
- **Expected**: 4-5 sources returning events with statistics

### 📊 System Monitoring
- **Performance**: Sub-second response times for most APIs
- **Deduplication**: ~5-10% duplicate rate across sources
- **Coverage**: 15-20 events per request from active sources
- **Memory**: ~26MB backend usage

### 🚨 Critical Files - DO NOT MODIFY WITHOUT PERMISSION
- `curate-events-api/.env` (API keys)
- `curate-events-api/src/utils/config.js` (configuration logic)
- `curate-events-api/src/routes/events.js` (multi-source integration)
- Database migrations in `/supabase/migrations/`

### 🔄 Recent Major Changes (Aug 2025)
- Security overhaul: Moved all API keys to environment variables
- Architecture fix: Integrated all 5 data sources (was only using 1)
- Performance optimization: Parallel API calls with deduplication
- Partner collaboration: Created environment-based configuration

### 📚 Reference Documentation
- **README.md**: Complete system overview and current status
- **ENVIRONMENT.md**: Environment setup details
- **PORT_MANAGEMENT.md**: Port configuration
- **PRD.md**: Product requirements

## Development Guidelines

### Before Making Changes
1. Read README.md for current system status
2. Check API source statistics and health
3. Understand recent changes and architecture
4. Test with multiple data sources
5. Monitor processing times and error rates

### File Management
- **DO NOT DELETE FILES OR MOVE FILES WITHOUT EXPLICIT PERMISSION**
- **DO NOT DO ANYTHING I DIDN'T ASK YOU TO DO**
- Always use Read tool before Edit/Write operations
- Prefer editing existing files over creating new ones

### Code Quality
- **NO SIMULATED CODE** - if you can't make it work, just say so
- Document everything clearly
- Include error handling and validation
- Test changes before committing

---

**Project Status**: ✅ Production Ready  
**Active Data Sources**: 4 of 5 (Apyflux experiencing API issues)  
**Security Status**: ✅ All credentials secured  
**Last Updated**: August 1, 2025