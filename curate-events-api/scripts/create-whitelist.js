/**
 * Creates the whitelist.xlsx file with default venue domains
 * Run once: node scripts/create-whitelist.js
 */

import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default venue data
const venues = [
  // MUSIC VENUES
  { category: 'music', scope: 'bayarea', domain: 'sfjazz.org', name: 'SFJAZZ Center', enabled: 'yes' },
  { category: 'music', scope: 'bayarea', domain: 'sfsymphony.org', name: 'SF Symphony', enabled: 'yes' },
  { category: 'music', scope: 'eastbay', domain: 'thegreekberkeley.com', name: 'Greek Theatre Berkeley', enabled: 'yes' },
  { category: 'music', scope: 'eastbay', domain: 'thefreight.org', name: 'Freight & Salvage', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'thefillmore.com', name: 'The Fillmore', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'theindependentsf.com', name: 'The Independent', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'bottomofthehill.com', name: 'Bottom of the Hill', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'greatamericanmusichall.com', name: 'Great American Music Hall', enabled: 'yes' },
  { category: 'music', scope: 'bayarea', domain: 'yoshis.com', name: 'Yoshis', enabled: 'yes' },
  { category: 'music', scope: 'eastbay', domain: 'foxoakland.com', name: 'Fox Theater Oakland', enabled: 'yes' },
  { category: 'music', scope: 'eastbay', domain: 'paramounttheatre.com', name: 'Paramount Theatre', enabled: 'yes' },
  { category: 'music', scope: 'southbay', domain: 'shoreline-amphitheatre.com', name: 'Shoreline Amphitheatre', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'chasecenter.com', name: 'Chase Center', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'thewarfieldtheatre.com', name: 'The Warfield', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'rickshawstop.com', name: 'Rickshaw Stop', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'bimbos365club.com', name: 'Bimbos 365 Club', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'cafedunord.com', name: 'Cafe Du Nord', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'dnalounge.com', name: 'DNA Lounge', enabled: 'yes' },
  { category: 'music', scope: 'sf', domain: 'augusthallsf.com', name: 'August Hall', enabled: 'yes' },
  { category: 'music', scope: 'southbay', domain: 'mountainwinery.com', name: 'Mountain Winery', enabled: 'yes' },
  { category: 'music', scope: 'southbay', domain: 'sanjosetheaters.org', name: 'San Jose Theaters', enabled: 'yes' },

  // THEATRE VENUES
  { category: 'theatre', scope: 'eastbay', domain: 'berkeleyrep.org', name: 'Berkeley Rep', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'act-sf.org', name: 'ACT San Francisco', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'sfplayhouse.org', name: 'SF Playhouse', enabled: 'yes' },
  { category: 'theatre', scope: 'southbay', domain: 'theatreworks.org', name: 'TheatreWorks', enabled: 'yes' },
  { category: 'theatre', scope: 'eastbay', domain: 'shotgunplayers.org', name: 'Shotgun Players', enabled: 'yes' },
  { category: 'theatre', scope: 'eastbay', domain: 'centralworks.org', name: 'Central Works', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'themarsh.org', name: 'The Marsh', enabled: 'yes' },
  { category: 'theatre', scope: 'bayarea', domain: 'calshakes.org', name: 'Cal Shakes', enabled: 'yes' },
  { category: 'theatre', scope: 'bayarea', domain: 'marinshakespeare.org', name: 'Marin Shakespeare', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'goldengatetheatre.com', name: 'Golden Gate Theatre', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'orpheum-theater.com', name: 'Orpheum Theatre', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'curran.com', name: 'Curran Theatre', enabled: 'yes' },
  { category: 'theatre', scope: 'sf', domain: 'broadwaysf.com', name: 'Broadway SF', enabled: 'yes' },

  // MOVIE VENUES
  { category: 'movies', scope: 'sf', domain: 'roxie.com', name: 'Roxie Theater', enabled: 'yes' },
  { category: 'movies', scope: 'bayarea', domain: 'rafaelfilm.cafilm.org', name: 'Rafael Film Center', enabled: 'yes' },
  { category: 'movies', scope: 'eastbay', domain: 'thenewparkway.com', name: 'New Parkway Theater', enabled: 'yes' },
  { category: 'movies', scope: 'bayarea', domain: 'rialtocinemas.com', name: 'Rialto Cinemas', enabled: 'yes' },
  { category: 'movies', scope: 'bayarea', domain: 'landmarktheatres.com', name: 'Landmark Theatres', enabled: 'yes' },
  { category: 'movies', scope: 'sf', domain: 'balboamovies.com', name: 'Balboa Theater', enabled: 'yes' },
  { category: 'movies', scope: 'sf', domain: 'castrotheatre.com', name: 'Castro Theatre', enabled: 'yes' },
  { category: 'movies', scope: 'sf', domain: 'sffilm.org', name: 'SFFILM', enabled: 'yes' },
  { category: 'movies', scope: 'bayarea', domain: 'cafilm.org', name: 'California Film Institute', enabled: 'yes' },

  // ART VENUES
  { category: 'art', scope: 'sf', domain: 'sfmoma.org', name: 'SFMOMA', enabled: 'yes' },
  { category: 'art', scope: 'sf', domain: 'asianart.org', name: 'Asian Art Museum', enabled: 'yes' },
  { category: 'art', scope: 'sf', domain: 'deyoung.famsf.org', name: 'de Young Museum', enabled: 'yes' },
  { category: 'art', scope: 'sf', domain: 'legionofhonor.famsf.org', name: 'Legion of Honor', enabled: 'yes' },
  { category: 'art', scope: 'eastbay', domain: 'oaklandmuseum.org', name: 'Oakland Museum', enabled: 'yes' },
  { category: 'art', scope: 'eastbay', domain: 'bampfa.org', name: 'BAMPFA', enabled: 'yes' },
  { category: 'art', scope: 'sf', domain: 'ybca.org', name: 'Yerba Buena Center', enabled: 'yes' },
  { category: 'art', scope: 'sf', domain: 'contemporaryjewishmuseum.org', name: 'Contemporary Jewish Museum', enabled: 'yes' },
  { category: 'art', scope: 'peninsula', domain: 'artmuseum.stanford.edu', name: 'Stanford Art Museum', enabled: 'yes' },
  { category: 'art', scope: 'southbay', domain: 'sjmusart.org', name: 'San Jose Museum of Art', enabled: 'yes' },

  // TALKS - GENERAL
  { category: 'talks', scope: 'sf', domain: 'commonwealthclub.org', name: 'Commonwealth Club', enabled: 'yes' },
  { category: 'talks', scope: 'eastbay', domain: 'events.berkeley.edu', name: 'UC Berkeley Events', enabled: 'yes' },
  { category: 'talks', scope: 'peninsula', domain: 'events.stanford.edu', name: 'Stanford Events', enabled: 'yes' },
  { category: 'talks', scope: 'sf', domain: 'sfpl.org', name: 'SF Public Library', enabled: 'yes' },
  { category: 'talks', scope: 'sf', domain: 'longnow.org', name: 'Long Now Foundation', enabled: 'yes' },
  { category: 'talks', scope: 'sf', domain: 'jccsf.org', name: 'JCCSF', enabled: 'yes' },

  // TALKS - AI/TECH
  { category: 'talks-ai', scope: 'peninsula', domain: 'hai.stanford.edu', name: 'Stanford HAI', enabled: 'yes' },
  { category: 'talks-ai', scope: 'eastbay', domain: 'bair.berkeley.edu', name: 'Berkeley AI Research', enabled: 'yes' },
  { category: 'talks-ai', scope: 'eastbay', domain: 'simons.berkeley.edu', name: 'Simons Institute', enabled: 'yes' },

  // TECHNOLOGY
  { category: 'technology', scope: 'bayarea', domain: 'svforum.org', name: 'SV Forum', enabled: 'yes' },
  { category: 'technology', scope: 'southbay', domain: 'computerhistory.org', name: 'Computer History Museum', enabled: 'yes' },

  // BUSINESS
  { category: 'business', scope: 'sf', domain: 'commonwealthclub.org', name: 'Commonwealth Club', enabled: 'yes' },
  { category: 'business', scope: 'eastbay', domain: 'haas.berkeley.edu', name: 'Haas School of Business', enabled: 'yes' },
  { category: 'business', scope: 'peninsula', domain: 'gsb.stanford.edu', name: 'Stanford GSB', enabled: 'yes' },

  // FOOD
  { category: 'food', scope: 'sf', domain: 'ferrybuildingmarketplace.com', name: 'Ferry Building', enabled: 'yes' },
  { category: 'food', scope: 'sf', domain: 'cuesa.org', name: 'CUESA', enabled: 'yes' },

  // PLATFORMS (for all categories)
  { category: 'all', scope: 'any', domain: 'eventbrite.com', name: 'Eventbrite', enabled: 'yes' },
  { category: 'all', scope: 'any', domain: 'meetup.com', name: 'Meetup', enabled: 'yes' },
  { category: 'all', scope: 'any', domain: 'lu.ma', name: 'Luma', enabled: 'yes' },
];

// Create workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(venues);

// Set column widths
ws['!cols'] = [
  { wch: 15 },  // category
  { wch: 12 },  // scope
  { wch: 35 },  // domain
  { wch: 30 },  // name
  { wch: 8 },   // enabled
];

XLSX.utils.book_append_sheet(wb, ws, 'Venues');

// Write file
const outputPath = path.join(__dirname, '..', 'whitelist.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ Created whitelist.xlsx at ${outputPath}`);
console.log(`   ${venues.length} venues configured`);

