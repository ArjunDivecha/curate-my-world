// Test portfolio detection logic with the actual events we're getting

const events = [
  {
    title: "San Francisco July Festivals & Street Fairs (2025)",
    description: "Look forward to the Fillmore Jazz Festival, SF's 4th of July Fireworks, the huge B26 Night Market and much more!"
  },
  {
    title: "San Francisco Events Calendar 2025/2026 | SF",
    description: "San Francisco's BEST Food Festivals, Wine, Spirits and Beer Festivals. Events are 1,000 in attendance and up with listings in all 50 states. Eat, Drink, Enjoy!"
  },
  {
    title: "San Francisco Concert Tickets - Upcoming event tickets in SF | Ticketmaster",
    description: "Buy San Francisco concert tickets on Ticketmaster. Find your favorite Music event tickets, schedules and seating charts in the San Francisco area."
  },
  {
    title: "18 fun events in SF, from a cathedral dance party to a dog rescue rave",
    description: "What events are worth checking out this week? We'll help you choose."
  },
  {
    title: "22 great events in San Francisco this week",
    description: "Night markets, secret raves, storytelling festivals, a dog's birthday, a caviar party, a cat cello concert, a..."
  }
];

function testPortfolioDetection(title, description) {
  console.log(`\n🔍 Testing: "${title}"`);
  console.log(`📝 Description: "${description}"`);
  
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  
  // Test each condition individually
  const tests = [
    { name: "Number + events pattern", test: title.match(/(\d+)\s+(fun\s+)?events/i) },
    { name: "Festivals & street fairs", test: title.match(/festivals?\s*(&|and)\s*street\s*fairs?/i) },
    { name: "Description events pattern", test: description.match(/(\d+)\s+events/i) },
    { name: "Calendar", test: titleLower.includes('calendar') },
    { name: "Upcoming events", test: titleLower.includes('upcoming events') },
    { name: "Event guide", test: titleLower.includes('event guide') },
    { name: "Events calendar", test: titleLower.includes('events calendar') },
    { name: "Concert tickets", test: titleLower.includes('concert tickets') },
    { name: "Event tickets", test: titleLower.includes('event tickets') },
    { name: "Concerts + 2025", test: (titleLower.includes('concerts') && titleLower.includes('2025')) },
    { name: "Events + 2025", test: (titleLower.includes('events') && titleLower.includes('2025')) },
    { name: "Find best events", test: descLower.includes('find the best events') },
    { name: "Upcoming event tickets", test: descLower.includes('upcoming event tickets') }
  ];
  
  let isPortfolio = false;
  console.log('📊 Individual test results:');
  
  tests.forEach(test => {
    if (test.test) {
      console.log(`   ✅ ${test.name}: MATCH`);
      isPortfolio = true;
    } else {
      console.log(`   ❌ ${test.name}: no match`);
    }
  });
  
  console.log(`🎯 FINAL RESULT: ${isPortfolio ? '✅ PORTFOLIO PAGE' : '❌ NOT PORTFOLIO'}`);
  
  return isPortfolio;
}

console.log('🔍 Testing Portfolio Detection Logic\n');
console.log('=' .repeat(60));

events.forEach(event => {
  testPortfolioDetection(event.title, event.description);
});

console.log('\n' + '=' .repeat(60));
console.log('🎯 SUMMARY: Portfolio detection results for actual events returned by our function');
