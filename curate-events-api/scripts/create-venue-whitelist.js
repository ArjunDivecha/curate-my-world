/**
 * Create venue-whitelist.xlsx from the venue data that was previously hardcoded
 * 
 * This script creates the initial whitelist file with all Bay Area venues
 * organized by category. Edit the XLSX file directly to add/remove venues.
 * 
 * Run: node scripts/create-venue-whitelist.js
 */

import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All venues organized by category
const venues = [
  // ==================== THEATRE ====================
  { category: 'theatre', name: 'Golden Gate Theatre', city: 'San Francisco', domain: 'broadwaysf.com', url: 'https://www.broadwaysf.com' },
  { category: 'theatre', name: 'War Memorial Opera House', city: 'San Francisco', domain: 'sfopera.com', url: 'https://www.sfopera.com' },
  { category: 'theatre', name: 'San Francisco Playhouse', city: 'San Francisco', domain: 'sfplayhouse.org', url: 'https://www.sfplayhouse.org' },
  { category: 'theatre', name: 'Brava Theater Center', city: 'San Francisco', domain: 'brava.org', url: 'https://www.brava.org' },
  { category: 'theatre', name: 'YBCA Theater', city: 'San Francisco', domain: 'ybca.org', url: 'https://ybca.org' },
  { category: 'theatre', name: 'Herbst Theatre', city: 'San Francisco', domain: 'cityboxoffice.com', url: 'https://www.cityboxoffice.com' },
  { category: 'theatre', name: 'A.C.T. Strand Theater', city: 'San Francisco', domain: 'act-sf.org', url: 'https://www.act-sf.org' },
  { category: 'theatre', name: 'New Conservatory Theatre Center', city: 'San Francisco', domain: 'nctcsf.org', url: 'https://www.nctcsf.org' },
  { category: 'theatre', name: 'Fox Theater Oakland', city: 'Oakland', domain: 'thefoxoakland.com', url: 'https://thefoxoakland.com' },
  { category: 'theatre', name: 'Greek Theatre UC Berkeley', city: 'Berkeley', domain: 'calperformances.org', url: 'https://calperformances.org' },
  { category: 'theatre', name: 'San Jose Center for Performing Arts', city: 'San Jose', domain: 'broadwaysanjose.com', url: 'https://broadwaysanjose.com' },
  { category: 'theatre', name: 'Paramount Theatre', city: 'Oakland', domain: 'paramountoakland.org', url: 'https://www.paramountoakland.org' },
  { category: 'theatre', name: 'Zellerbach Hall', city: 'Berkeley', domain: 'calperformances.org', url: 'https://calperformances.org' },
  { category: 'theatre', name: 'Berkeley Playhouse', city: 'Berkeley', domain: 'berkeleyplayhouse.org', url: 'https://berkeleyplayhouse.org' },
  { category: 'theatre', name: 'Oakland Theater Project', city: 'Oakland', domain: 'oaklandtheaterproject.org', url: 'https://oaklandtheaterproject.org' },
  { category: 'theatre', name: 'TheatreFirst', city: 'Berkeley', domain: 'theatrefirst.com', url: 'https://www.theatrefirst.com' },
  { category: 'theatre', name: 'Berkeley Rep', city: 'Berkeley', domain: 'berkeleyrep.org', url: 'https://www.berkeleyrep.org' },
  { category: 'theatre', name: 'Marin Center', city: 'San Rafael', domain: 'marincenter.org', url: 'https://www.marincenter.org' },
  { category: 'theatre', name: 'Stanford Theatre', city: 'Palo Alto', domain: 'stanfordtheatre.org', url: 'https://stanfordtheatre.org' },
  { category: 'theatre', name: 'Mountain View Center for Performing Arts', city: 'Mountain View', domain: 'mvcpa.com', url: 'https://mvcpa.com' },
  { category: 'theatre', name: 'Marin Theatre Company', city: 'Mill Valley', domain: 'marintheatre.org', url: 'https://www.marintheatre.org' },
  { category: 'theatre', name: 'TheatreWorks Silicon Valley', city: 'Palo Alto', domain: 'theatreworks.org', url: 'https://www.theatreworks.org' },

  // ==================== MUSIC ====================
  { category: 'music', name: 'Bill Graham Civic Auditorium', city: 'San Francisco', domain: 'billgrahamcivicauditorium.com', url: 'https://billgrahamcivicauditorium.com' },
  { category: 'music', name: 'The Fillmore', city: 'San Francisco', domain: 'thefillmore.com', url: 'https://thefillmore.com' },
  { category: 'music', name: 'Great American Music Hall', city: 'San Francisco', domain: 'gamh.com', url: 'https://gamh.com' },
  { category: 'music', name: 'Chase Center', city: 'San Francisco', domain: 'chasecenter.com', url: 'https://chasecenter.com' },
  { category: 'music', name: 'SFJAZZ Center', city: 'San Francisco', domain: 'sfjazz.org', url: 'https://sfjazz.org' },
  { category: 'music', name: 'The Warfield', city: 'San Francisco', domain: 'thewarfieldtheatre.com', url: 'https://thewarfieldtheatre.com' },
  { category: 'music', name: 'The Regency Ballroom', city: 'San Francisco', domain: 'theregencyballroom.com', url: 'https://theregencyballroom.com' },
  { category: 'music', name: 'The Independent', city: 'San Francisco', domain: 'theindependentsf.com', url: 'https://theindependentsf.com' },
  { category: 'music', name: 'The Masonic', city: 'San Francisco', domain: 'masonicsf.com', url: 'https://masonicsf.com' },
  { category: 'music', name: 'Stern Grove Festival', city: 'San Francisco', domain: 'sterngrove.org', url: 'https://sterngrove.org' },
  { category: 'music', name: 'Oracle Park', city: 'San Francisco', domain: 'mlb.com', url: 'https://mlb.com/giants/ballpark' },
  { category: 'music', name: 'Golden Gate Park Bandshell', city: 'San Francisco', domain: 'illuminatesf.org', url: 'https://illuminatesf.org/bandshell' },
  { category: 'music', name: 'Shoreline Amphitheatre', city: 'Mountain View', domain: 'livenation.com', url: 'https://livenation.com' },
  { category: 'music', name: 'Oakland Arena', city: 'Oakland', domain: 'oaklandarena.com', url: 'https://oaklandarena.com' },
  { category: 'music', name: 'The New Parish', city: 'Oakland', domain: 'thenewparish.com', url: 'https://thenewparish.com' },
  { category: 'music', name: 'SAP Center', city: 'San Jose', domain: 'sapcenter.com', url: 'https://sapcenter.com' },
  { category: 'music', name: 'San Jose Civic', city: 'San Jose', domain: 'sanjosecivic.com', url: 'https://sanjosecivic.com' },
  { category: 'music', name: "Levi's Stadium", city: 'Santa Clara', domain: 'levisstadium.com', url: 'https://levisstadium.com' },
  { category: 'music', name: 'Mountain Winery', city: 'Saratoga', domain: 'mountainwinery.com', url: 'https://mountainwinery.com' },
  { category: 'music', name: 'The Guild Theatre', city: 'Menlo Park', domain: 'theguildtheatre.com', url: 'https://theguildtheatre.com' },
  { category: 'music', name: 'Bottom of the Hill', city: 'San Francisco', domain: 'bottomofthehill.com', url: 'https://bottomofthehill.com' },
  { category: 'music', name: 'The Chapel', city: 'San Francisco', domain: 'thechapelsf.com', url: 'https://thechapelsf.com' },
  { category: 'music', name: 'Slim\'s', city: 'San Francisco', domain: 'slimspresents.com', url: 'https://slimspresents.com' },
  { category: 'music', name: 'Yoshi\'s', city: 'Oakland', domain: 'yoshis.com', url: 'https://yoshis.com' },

  // ==================== COMEDY ====================
  { category: 'comedy', name: 'Cobb\'s Comedy Club', city: 'San Francisco', domain: 'cobbscomedyclub.com', url: 'https://cobbscomedyclub.com' },
  { category: 'comedy', name: 'The Punchline', city: 'San Francisco', domain: 'punchlinecomedyclub.com', url: 'https://punchlinecomedyclub.com' },
  { category: 'comedy', name: 'Tommy T\'s Comedy Club', city: 'Pleasanton', domain: 'tommyts.com', url: 'https://tommyts.com' },
  { category: 'comedy', name: 'Rooster T. Feathers', city: 'Sunnyvale', domain: 'roostertfeathers.com', url: 'https://roostertfeathers.com' },
  { category: 'comedy', name: 'Comedy Oakland', city: 'Oakland', domain: 'comedyoakland.com', url: 'https://comedyoakland.com' },
  { category: 'comedy', name: 'San Jose Improv', city: 'San Jose', domain: 'sanjose.improv.com', url: 'https://sanjose.improv.com' },
  { category: 'comedy', name: 'Helium Comedy Club', city: 'San Jose', domain: 'heliumcomedy.com', url: 'https://heliumcomedy.com' },
  { category: 'comedy', name: 'The Comedy Spot', city: 'Sacramento', domain: 'thecomedyspot.net', url: 'https://thecomedyspot.net' },
  { category: 'comedy', name: 'Sacramento Comedy Spot', city: 'Sacramento', domain: 'saccomedyspot.com', url: 'https://saccomedyspot.com' },
  { category: 'comedy', name: 'Laugh Track Comedy Club', city: 'San Jose', domain: 'laughtrackcomedy.com', url: 'https://laughtrackcomedy.com' },

  // ==================== LECTURES ====================
  { category: 'lectures', name: 'City Arts & Lectures', city: 'San Francisco', domain: 'cityarts.net', url: 'https://www.cityarts.net' },
  { category: 'lectures', name: 'Commonwealth Club', city: 'San Francisco', domain: 'commonwealthclub.org', url: 'https://www.commonwealthclub.org' },
  { category: 'lectures', name: 'KQED Live', city: 'San Francisco', domain: 'kqed.org', url: 'https://www.kqed.org/live' },
  { category: 'lectures', name: 'Profs and Pints', city: 'San Francisco', domain: 'profsandpints.com', url: 'https://www.profsandpints.com/sfbayarea' },
  { category: 'lectures', name: 'Long Now Foundation', city: 'San Francisco', domain: 'longnow.org', url: 'https://longnow.org' },
  { category: 'lectures', name: 'Manny\'s SF', city: 'San Francisco', domain: 'welcometomannys.com', url: 'https://www.welcometomannys.com' },
  { category: 'lectures', name: 'SF Public Library', city: 'San Francisco', domain: 'sfpl.org', url: 'https://sfpl.org' },
  { category: 'lectures', name: 'SLAC Public Lectures', city: 'Menlo Park', domain: 'slac.stanford.edu', url: 'https://www6.slac.stanford.edu' },
  { category: 'lectures', name: 'Randall Museum', city: 'San Francisco', domain: 'randallmuseum.org', url: 'https://randallmuseum.org' },
  { category: 'lectures', name: 'Omnivore Books on Food', city: 'San Francisco', domain: 'omnivorebooks.com', url: 'https://www.omnivorebooks.com' },
  { category: 'lectures', name: 'CIIS Public Programs', city: 'San Francisco', domain: 'ciis.edu', url: 'https://www.ciis.edu/public-programs' },
  { category: 'lectures', name: 'Stanford Live', city: 'Stanford', domain: 'live.stanford.edu', url: 'https://live.stanford.edu' },
  { category: 'lectures', name: 'Cal Performances', city: 'Berkeley', domain: 'calperformances.org', url: 'https://calperformances.org' },
  { category: 'lectures', name: 'Wonderfest', city: 'Bay Area', domain: 'wonderfest.org', url: 'https://wonderfest.org' },
  { category: 'lectures', name: 'Berkeley City Club', city: 'Berkeley', domain: 'berkeleycityclub.com', url: 'https://berkeleycityclub.com' },
  { category: 'lectures', name: 'Jewish Community Center SF', city: 'San Francisco', domain: 'jccsf.org', url: 'https://www.jccsf.org' },

  // ==================== KIDS/FAMILY ====================
  { category: 'kids', name: 'California Academy of Sciences', city: 'San Francisco', domain: 'calacademy.org', url: 'https://www.calacademy.org' },
  { category: 'kids', name: 'Exploratorium', city: 'San Francisco', domain: 'exploratorium.edu', url: 'https://www.exploratorium.edu' },
  { category: 'kids', name: 'Children\'s Creativity Museum', city: 'San Francisco', domain: 'creativity.org', url: 'https://creativity.org' },
  { category: 'kids', name: 'Bay Area Discovery Museum', city: 'Sausalito', domain: 'bayareadiscoverymuseum.org', url: 'https://bayareadiscoverymuseum.org' },
  { category: 'kids', name: 'Lawrence Hall of Science', city: 'Berkeley', domain: 'lawrencehallofscience.org', url: 'https://www.lawrencehallofscience.org' },
  { category: 'kids', name: 'Oakland Zoo', city: 'Oakland', domain: 'oaklandzoo.org', url: 'https://www.oaklandzoo.org' },
  { category: 'kids', name: 'San Francisco Zoo', city: 'San Francisco', domain: 'sfzoo.org', url: 'https://www.sfzoo.org' },
  { category: 'kids', name: 'Chabot Space & Science Center', city: 'Oakland', domain: 'chabotspace.org', url: 'https://chabotspace.org' },
  { category: 'kids', name: 'Lindsay Wildlife Experience', city: 'Walnut Creek', domain: 'lindsaywildlife.org', url: 'https://lindsaywildlife.org' },
  { category: 'kids', name: 'Children\'s Fairyland', city: 'Oakland', domain: 'fairyland.org', url: 'https://fairyland.org' },
  { category: 'kids', name: 'Habitot Children\'s Museum', city: 'Berkeley', domain: 'habitot.org', url: 'https://www.habitot.org' },
  { category: 'kids', name: 'CuriOdyssey', city: 'San Mateo', domain: 'curiodyssey.org', url: 'https://curiodyssey.org' },
  { category: 'kids', name: 'Happy Hollow Park & Zoo', city: 'San Jose', domain: 'happyhollow.org', url: 'https://www.happyhollow.org' },
  { category: 'kids', name: 'Children\'s Discovery Museum', city: 'San Jose', domain: 'cdm.org', url: 'https://www.cdm.org' },

  // ==================== MOVIES ====================
  { category: 'movies', name: 'AMC Metreon 16', city: 'San Francisco', domain: 'amctheatres.com', url: 'https://www.amctheatres.com' },
  { category: 'movies', name: 'The Castro Theatre', city: 'San Francisco', domain: 'thecastrotheatre.com', url: 'https://thecastrotheatre.com' },
  { category: 'movies', name: 'Roxie Theater', city: 'San Francisco', domain: 'roxie.com', url: 'https://www.roxie.com' },
  { category: 'movies', name: 'Landmark Theatres', city: 'San Francisco', domain: 'landmarktheatres.com', url: 'https://www.landmarktheatres.com' },
  { category: 'movies', name: 'Alamo Drafthouse', city: 'San Francisco', domain: 'drafthouse.com', url: 'https://drafthouse.com' },
  { category: 'movies', name: 'Century Theatres', city: 'Various', domain: 'cinemark.com', url: 'https://www.cinemark.com' },
  { category: 'movies', name: 'Balboa Theatre', city: 'San Francisco', domain: 'cinemasf.com', url: 'https://www.cinemasf.com' },
  { category: 'movies', name: 'New Parkway Theater', city: 'Oakland', domain: 'thenewparkway.com', url: 'https://www.thenewparkway.com' },
  { category: 'movies', name: 'Grand Lake Theatre', city: 'Oakland', domain: 'rfrestheatres.com', url: 'https://www.rfrestheatres.com' },
  { category: 'movies', name: 'Camera Cinemas', city: 'San Jose', domain: 'cameracinemas.com', url: 'https://www.cameracinemas.com' },

  // ==================== ART ====================
  { category: 'art', name: 'SFMOMA', city: 'San Francisco', domain: 'sfmoma.org', url: 'https://www.sfmoma.org' },
  { category: 'art', name: 'de Young Museum', city: 'San Francisco', domain: 'deyoung.famsf.org', url: 'https://deyoung.famsf.org' },
  { category: 'art', name: 'Legion of Honor', city: 'San Francisco', domain: 'legionofhonor.famsf.org', url: 'https://legionofhonor.famsf.org' },
  { category: 'art', name: 'Asian Art Museum', city: 'San Francisco', domain: 'asianart.org', url: 'https://asianart.org' },
  { category: 'art', name: 'Oakland Museum of California', city: 'Oakland', domain: 'museumca.org', url: 'https://museumca.org' },
  { category: 'art', name: 'Berkeley Art Museum', city: 'Berkeley', domain: 'bampfa.org', url: 'https://bampfa.org' },
  { category: 'art', name: 'Cantor Arts Center', city: 'Stanford', domain: 'museum.stanford.edu', url: 'https://museum.stanford.edu' },
  { category: 'art', name: 'San Jose Museum of Art', city: 'San Jose', domain: 'sjmusart.org', url: 'https://sjmusart.org' },
  { category: 'art', name: 'Yerba Buena Center for Arts', city: 'San Francisco', domain: 'ybca.org', url: 'https://ybca.org' },
  { category: 'art', name: 'Contemporary Jewish Museum', city: 'San Francisco', domain: 'thecjm.org', url: 'https://thecjm.org' },
  { category: 'art', name: 'Museum of Craft and Design', city: 'San Francisco', domain: 'sfmcd.org', url: 'https://sfmcd.org' },

  // ==================== FOOD ====================
  { category: 'food', name: 'Ferry Building Marketplace', city: 'San Francisco', domain: 'ferrybuildingmarketplace.com', url: 'https://www.ferrybuildingmarketplace.com' },
  { category: 'food', name: 'La Cocina', city: 'San Francisco', domain: 'lacocinasf.org', url: 'https://www.lacocinasf.org' },
  { category: 'food', name: 'SF Cooking School', city: 'San Francisco', domain: 'sfcooking.com', url: 'https://www.sfcooking.com' },
  { category: 'food', name: 'Sur La Table', city: 'Various', domain: 'surlatable.com', url: 'https://www.surlatable.com' },
  { category: 'food', name: 'Williams Sonoma', city: 'Various', domain: 'williams-sonoma.com', url: 'https://www.williams-sonoma.com' },
  { category: 'food', name: 'Bi-Rite Market', city: 'San Francisco', domain: 'biritemarket.com', url: 'https://www.biritemarket.com' },
  { category: 'food', name: 'Napa Valley Wine Train', city: 'Napa', domain: 'winetrain.com', url: 'https://www.winetrain.com' },
  { category: 'food', name: 'Oxbow Public Market', city: 'Napa', domain: 'oxbowpublicmarket.com', url: 'https://oxbowpublicmarket.com' },

  // ==================== TECH ====================
  { category: 'tech', name: 'Moscone Center', city: 'San Francisco', domain: 'moscone.com', url: 'https://moscone.com' },
  { category: 'tech', name: 'General Assembly', city: 'San Francisco', domain: 'generalassemb.ly', url: 'https://generalassemb.ly' },
  { category: 'tech', name: 'Galvanize', city: 'San Francisco', domain: 'galvanize.com', url: 'https://www.galvanize.com' },
  { category: 'tech', name: 'Hack Reactor', city: 'San Francisco', domain: 'hackreactor.com', url: 'https://www.hackreactor.com' },
  { category: 'tech', name: 'Hacker Dojo', city: 'Mountain View', domain: 'hackerdojo.org', url: 'https://www.hackerdojo.org' },
  { category: 'tech', name: 'Noisebridge', city: 'San Francisco', domain: 'noisebridge.net', url: 'https://www.noisebridge.net' },
  { category: 'tech', name: 'Computer History Museum', city: 'Mountain View', domain: 'computerhistory.org', url: 'https://computerhistory.org' },
  { category: 'tech', name: 'WeWork', city: 'Various', domain: 'wework.com', url: 'https://www.wework.com' },

  // ==================== AGGREGATOR PLATFORMS ====================
  { category: 'all', name: 'Eventbrite', city: 'Various', domain: 'eventbrite.com', url: 'https://www.eventbrite.com' },
  { category: 'all', name: 'Meetup', city: 'Various', domain: 'meetup.com', url: 'https://www.meetup.com' },
  { category: 'all', name: 'Lu.ma', city: 'Various', domain: 'lu.ma', url: 'https://lu.ma' },
  { category: 'all', name: 'Facebook Events', city: 'Various', domain: 'facebook.com', url: 'https://www.facebook.com/events' },
];

// Create workbook
const workbook = XLSX.utils.book_new();

// Create worksheet from data
const worksheet = XLSX.utils.json_to_sheet(venues);

// Set column widths for readability
worksheet['!cols'] = [
  { wch: 12 },  // category
  { wch: 35 },  // name
  { wch: 18 },  // city
  { wch: 30 },  // domain
  { wch: 50 },  // url
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Venues');

// Write file
const outputPath = path.join(__dirname, '..', 'data', 'venue-whitelist.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`✅ Created venue whitelist with ${venues.length} venues at:`);
console.log(`   ${outputPath}`);
console.log('\nCategories included:');

// Count by category
const categoryCounts = {};
venues.forEach(v => {
  categoryCounts[v.category] = (categoryCounts[v.category] || 0) + 1;
});
Object.entries(categoryCounts).sort().forEach(([cat, count]) => {
  console.log(`   - ${cat}: ${count} venues`);
});

