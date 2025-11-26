/**
 * Create initial whitelist and blacklist XLSX files
 */

import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =============================================================================
// WHITELIST - Sites to always search for events
// =============================================================================
const whitelistData = [
  // Music venues
  { domain: 'thefillmore.com', category: 'music', name: 'The Fillmore', city: 'San Francisco' },
  { domain: 'sfjazz.org', category: 'music', name: 'SFJAZZ Center', city: 'San Francisco' },
  { domain: 'theindependentsf.com', category: 'music', name: 'The Independent', city: 'San Francisco' },
  { domain: 'slimspresents.com', category: 'music', name: 'Slims', city: 'San Francisco' },
  { domain: 'gamh.com', category: 'music', name: 'Great American Music Hall', city: 'San Francisco' },
  { domain: 'thechapelsf.com', category: 'music', name: 'The Chapel', city: 'San Francisco' },
  { domain: 'bottomofthehill.com', category: 'music', name: 'Bottom of the Hill', city: 'San Francisco' },
  { domain: 'thegreekberkeley.com', category: 'music', name: 'Greek Theatre', city: 'Berkeley' },
  { domain: 'foxoakland.com', category: 'music', name: 'Fox Theater', city: 'Oakland' },
  
  // Theatre
  { domain: 'sfopera.com', category: 'theatre', name: 'SF Opera', city: 'San Francisco' },
  { domain: 'sfballet.org', category: 'theatre', name: 'SF Ballet', city: 'San Francisco' },
  { domain: 'act-sf.org', category: 'theatre', name: 'A.C.T.', city: 'San Francisco' },
  { domain: 'berkeleyrep.org', category: 'theatre', name: 'Berkeley Rep', city: 'Berkeley' },
  { domain: 'broadwaysf.com', category: 'theatre', name: 'Broadway SF', city: 'San Francisco' },
  
  // Comedy
  { domain: 'cobbscomedy.com', category: 'comedy', name: 'Cobbs Comedy Club', city: 'San Francisco' },
  { domain: 'punchlinecomedyclub.com', category: 'comedy', name: 'Punch Line', city: 'San Francisco' },
  
  // Art/Museums
  { domain: 'sfmoma.org', category: 'art', name: 'SFMOMA', city: 'San Francisco' },
  { domain: 'deyoung.famsf.org', category: 'art', name: 'de Young Museum', city: 'San Francisco' },
  { domain: 'legionofhonor.famsf.org', category: 'art', name: 'Legion of Honor', city: 'San Francisco' },
  
  // Movies
  { domain: 'roxie.com', category: 'movies', name: 'Roxie Theater', city: 'San Francisco' },
  { domain: 'castrotheater.com', category: 'movies', name: 'Castro Theatre', city: 'San Francisco' },
  { domain: 'balboa-theater.com', category: 'movies', name: 'Balboa Theater', city: 'San Francisco' },
  
  // Kids/Family
  { domain: 'calacademy.org', category: 'kids', name: 'California Academy of Sciences', city: 'San Francisco' },
  { domain: 'exploratorium.edu', category: 'kids', name: 'Exploratorium', city: 'San Francisco' },
  
  // Food
  { domain: 'sfstreetfood.com', category: 'food', name: 'SF Street Food Festival', city: 'San Francisco' },
  
  // Lectures
  { domain: 'cityarts.net', category: 'lectures', name: 'City Arts & Lectures', city: 'San Francisco' },
  { domain: 'commonwealthclub.org', category: 'lectures', name: 'Commonwealth Club', city: 'San Francisco' },
];

// =============================================================================
// BLACKLIST SITES - Domains to never show events from
// =============================================================================
const blacklistSitesData = [
  // Empty initially - users will add via GUI
  { domain: 'example-spam-site.com', reason: 'Example - remove this', date_added: new Date().toISOString().split('T')[0] },
];

// =============================================================================
// BLACKLIST EVENTS - Specific events to never show
// =============================================================================
const blacklistEventsData = [
  // Empty initially - users will add via GUI  
  { title: 'Example Event to Block', url: 'https://example.com/event', date_added: new Date().toISOString().split('T')[0] },
];

// =============================================================================
// CREATE FILES
// =============================================================================

function createXLSX(filename, data, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  const filepath = path.join(DATA_DIR, filename);
  XLSX.writeFile(wb, filepath);
  console.log(`✅ Created ${filepath} with ${data.length} entries`);
}

console.log('Creating whitelist/blacklist XLSX files...\n');

createXLSX('whitelist.xlsx', whitelistData, 'Whitelist');
createXLSX('blacklist-sites.xlsx', blacklistSitesData, 'Blacklist Sites');
createXLSX('blacklist-events.xlsx', blacklistEventsData, 'Blacklist Events');

console.log('\n✅ All files created in', DATA_DIR);
console.log('\nYou can edit these files in Excel/Google Sheets to add/remove entries.');

