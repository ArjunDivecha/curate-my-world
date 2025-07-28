# Environment Variables

This document describes the environment variables required for the Curate My World application.

## Required Environment Variables

### Supabase Variables
These are automatically provided by Supabase when running functions:

- `SUPABASE_URL` - The Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - The service role key for accessing Supabase

### API Keys

- `BRAVE_SEARCH_API_KEY` - API key for Brave Search API (required for web scraping)
- `GOOGLE_MAPS_API_KEY` - API key for Google Maps (optional but recommended for better location filtering)
- `TICKETMASTER_API_KEY` - API key for Ticketmaster (optional for direct Ticketmaster integration)
- `EVENTBRITE_API_TOKEN` - API token for Eventbrite (optional for direct Eventbrite integration)

## Setting up Environment Variables

### In Development

Create a `.env.local` file in the root of the project with the following content:

```env
BRAVE_SEARCH_API_KEY=your_brave_search_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
TICKETMASTER_API_KEY=your_ticketmaster_api_key
EVENTBRITE_API_TOKEN=your_eventbrite_api_token
```

### In Supabase

Set the environment variables in the Supabase dashboard:

1. Go to your Supabase project
2. Navigate to Settings > Configuration > Environment Variables
3. Add each required variable with its corresponding value

Note: The Supabase variables (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) are automatically provided.