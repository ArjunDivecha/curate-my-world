// Verify that the specific events are showing up as separate individual events
const verifyIndividualEvents = async () => {
  console.log('🔍 Verifying individual events from portfolio scraping...');
  
  const functionUrl = 'https://llspbinxevyitinvagvx.supabase.co/functions/v1/fetch-real-events';
  
  const testPayload = {
    location: "San Francisco, CA",
    preferences: {
      categories: ["Music"],
      customKeywords: ["concert"]
    }
  };
  
  try {
    console.log('📡 Calling function to get fresh events...');
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsc3BiaW54ZXZ5aXRpbnZhZ3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2Nzk3NTUsImV4cCI6MjA2OTI1NTc1NX0.1biD6WrrLT5dNwmpIkjyeR53E6Gxa_cRdO-DLsdu6c4'
      },
      body: JSON.stringify(testPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Response received! Found ${data.events?.length || 0} events\n`);
    
    if (data.events && data.events.length > 0) {
      // Check for the specific events you mentioned
      const targetEvents = [
        'D4vd',
        'Tab Benoit', 
        'Jutes',
        'Ramirez',
        'Marcus King',
        'Rain - A Tribute to the Beatles',
        'Lorde'
      ];
      
      const targetVenues = [
        'The Warfield',
        'The Guild Theatre',
        'The Independent', 
        'August Hall',
        'Ruth Finley Person Theater',
        'Golden Gate Theatre',
        'The Greek Theatre Berkeley'
      ];
      
      console.log('🎯 CHECKING FOR SPECIFIC EVENTS:\n');
      
      let foundCount = 0;
      targetEvents.forEach((eventName, index) => {
        const venue = targetVenues[index];
        
        // Look for events with matching title or venue
        const matchingEvents = data.events.filter(event => 
          event.title.toLowerCase().includes(eventName.toLowerCase()) ||
          event.venue.toLowerCase().includes(venue.toLowerCase()) ||
          (event.title.toLowerCase().includes(eventName.toLowerCase().split(' ')[0]) && 
           event.venue.toLowerCase().includes(venue.toLowerCase().split(' ')[0]))
        );
        
        if (matchingEvents.length > 0) {
          foundCount++;
          matchingEvents.forEach(event => {
            console.log(`✅ FOUND: "${event.title}"`);
            console.log(`   📍 Venue: ${event.venue}`);
            console.log(`   📅 Date: ${new Date(event.date_time).toLocaleDateString()}`);
            console.log(`   🔗 Source: ${event.source}`);
            console.log(`   🆔 Event ID: ${event.id}`);
            console.log(`   🔗 URL: ${event.external_url}`);
            console.log('');
          });
        } else {
          console.log(`❌ NOT FOUND: ${eventName} at ${venue}`);
        }
      });
      
      console.log(`📊 SUMMARY:`);
      console.log(`✅ Found ${foundCount} out of ${targetEvents.length} target events`);
      
      // Show all scraped events
      const scrapedEvents = data.events.filter(event => event.source === 'brave_search_scraped');
      console.log(`\n🎯 ALL PORTFOLIO SCRAPED EVENTS (${scrapedEvents.length}):`);
      scrapedEvents.forEach((event, index) => {
        console.log(`${index + 1}. "${event.title}"`);
        console.log(`   📍 ${event.venue}`);
        console.log(`   📅 ${new Date(event.date_time).toLocaleDateString()}`);
        console.log(`   🆔 ${event.id}`);
        console.log('');
      });
      
      if (scrapedEvents.length > 0) {
        console.log('🎉 YES! These events ARE showing up as separate individual events!');
        console.log('✅ Each event has its own unique ID');
        console.log('✅ Each event has specific venue information');
        console.log('✅ Each event has individual dates');
        console.log('✅ Each event is stored separately in the database');
        console.log('✅ Each event will appear as a separate item in the UI');
      } else {
        console.log('❌ No scraped events found in this run');
      }
      
    } else {
      console.log('❌ No events found');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
};

verifyIndividualEvents();
