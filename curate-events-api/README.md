# Curate Events API

Simple, reliable Node.js API server that uses Perplexity AI to collect real-world events. This replaces the problematic Supabase Edge Function approach.

## Architecture

```
Frontend → Node.js API Server → Perplexity API
          ↳ Returns 30+ events like proven tests
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your PERPLEXITY_API_KEY
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Test the API:**
   ```bash
   curl http://localhost:8765/api/events/theatre?location=NYC
   ```

## API Endpoints

### GET /api/events/:category
Fetch events for a specific category.

**Parameters:**
- `category` - Event category (theatre, music, comedy, etc.)
- `location` - Location query (e.g., "NYC", "San Francisco")
- `date_range` - Optional date range (e.g., "this weekend", "next month")

**Example:**
```bash
GET /api/events/theatre?location=NYC&date_range=this weekend
```

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "title": "Event Title",
      "venue": "Venue Name",
      "date": "2024-01-15",
      "time": "8:00 PM",
      "location": "123 Main St, NYC",
      "description": "Event description...",
      "price": "$25-$75",
      "website": "https://example.com",
      "category": "theatre"
    }
  ],
  "count": 15,
  "query": {
    "category": "theatre",
    "location": "NYC",
    "date_range": "this weekend"
  }
}
```

## Project Structure

```
curate-events-api/
├── src/
│   ├── clients/
│   │   └── PerplexityClient.js    # Direct API wrapper
│   ├── parsers/
│   │   ├── EventParser.js         # Response parsing logic
│   │   └── ResponseValidator.js   # Validation utilities
│   ├── managers/
│   │   └── CategoryManager.js     # Prompt & category config
│   ├── pipeline/
│   │   └── EventPipeline.js       # Orchestration logic
│   ├── routes/
│   │   ├── events.js              # Event API endpoints
│   │   └── health.js              # Health check endpoint
│   ├── utils/
│   │   ├── logger.js              # Logging utility
│   │   └── config.js              # Configuration
│   └── server.js                  # Express server
├── tests/
│   └── integration/
├── package.json
├── .env.example
└── README.md
```

## Deployment

Ready for deployment on:
- Vercel
- Railway  
- Traditional hosting
- Docker containers

## Environment Variables

See `.env.example` for all configuration options.

Required:
- `PERPLEXITY_API_KEY` - Your Perplexity API key

Optional:
- `PORT` - Server port (default: 8765)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS