// /Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/curate-my-world/debug_scraper.ts

/**
 * INPUT FILES:
 *  - /Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/curate-my-world/supabase/functions/fetch-real-events/index.ts
 *
 * OUTPUT FILES:
 *  - Console output with scraped event data or error messages.
 *
 * DESCRIPTION:
 * This script is designed to debug the portfolio event scraping functionality in isolation.
 * It imports the scraping function from the main Edge Function file, provides a sample
 * portfolio URL, and executes the scraper to analyze its output and diagnose issues.
 * This allows for targeted debugging without needing the full Supabase local environment.
 * 
 * Version: 1.0
 * Date: 2025-07-28
 */

import { scrapePortfolioEvents } from './supabase/functions/fetch-real-events/index.ts';
import { EventPreferences } from './supabase/functions/shared/types.ts';

async function runTest() {
  console.log('🚀 Starting scraper debug test...');

  const testUrl = 'https://www.ticketmaster.com/discover/concerts/san-francisco';
  const testLocation = 'San Francisco, CA';
  const testPreferences: EventPreferences = {
    search_radius: 50,
    min_price: 0,
    max_price: 500,
    start_date: new Date().toISOString(),
    end_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
    categories: ['music', 'art', 'food'],
    customKeywords: ['festival', 'live music'],
    venue_types: ['concert hall', 'outdoor'],
    user_id: 'debug-user'
  };

  try {
    console.log(`
--- Fetching and scraping URL: ${testUrl} ---
`);
    const events = await scrapePortfolioEvents(testUrl, testLocation, testPreferences);

    console.log(`
--- Scraping complete. Results: ---
`);

    if (events.length > 0) {
      console.log(`✅ SUCCESS: Found ${events.length} events.`);
      console.log('Sample events:', JSON.stringify(events.slice(0, 2), null, 2));
    } else {
      console.log('❌ FAILURE: No events were scraped from the page.');
    }

  } catch (error) {
    console.error('💥 An error occurred during the scraping test:');
    console.error(`- Message: ${error.message}`);
    console.error(`- Stack: ${error.stack}`);
  }

  console.log('\n🏁 Scraper debug test finished.');
}

runTest();
