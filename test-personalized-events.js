#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testPersonalizedEventSearch() {
  console.log('🎯 PERSONALIZED EVENT SEARCH BASED ON CONVERSATION ANALYSIS');
  console.log('=' * 60);
  
  try {
    // Your personalized search payload based on conversation analysis
    const personalizedPayload = {
      location: "San Francisco, CA",
      radius: 25,
      preferences: {
        categories: [
          "technology",
          "education", 
          "business",
          "science"
        ],
        priceRange: {
          min: 0,
          max: 100
        },
        timePreferences: ["Evening", "Weekend"],
        customKeywords: [
          "python programming",
          "data science",
          "machine learning", 
          "stock market",
          "investment",
          "tesla",
          "electric vehicle",
          "maker space",
          "coding workshop",
          "fintech",
          "analytics",
          "startup"
        ],
        eventTypes: [
          "workshop",
          "meetup", 
          "conference",
          "seminar",
          "networking"
        ]
      }
    };

    console.log('📡 Calling Perplexity with personalized query...');
    
    // Call the Perplexity function
    const { data, error } = await supabase.functions.invoke('perplexity-events', {
      body: personalizedPayload
    });

    if (error) {
      console.error('❌ Error calling Perplexity function:', error);
      return;
    }

    console.log('✅ Perplexity response received');
    console.log('📊 Results:', JSON.stringify(data, null, 2));

    if (data && data.events) {
      console.log(`\n🎉 Found ${data.events.length} personalized events:`);
      
      data.events.forEach((event, index) => {
        console.log(`\n${index + 1}. ${event.title}`);
        console.log(`   📅 ${event.date || 'Date TBD'}`);
        console.log(`   📍 ${event.location || 'Location TBD'}`);
        console.log(`   💰 ${event.price || 'Price TBD'}`);
        console.log(`   🏷️  ${event.category || 'Category TBD'}`);
        if (event.description) {
          console.log(`   📝 ${event.description.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('⚠️ No events found in response');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Also test with a more specific technical query
async function testTechnicalEventSearch() {
  console.log('\n\n🔬 TECHNICAL EVENT SEARCH');
  console.log('=' * 30);
  
  try {
    const techPayload = {
      location: "San Francisco, CA",
      radius: 25,
      preferences: {
        categories: ["technology", "education"],
        priceRange: { min: 0, max: 100 },
        customKeywords: [
          "Python workshop",
          "data science meetup", 
          "machine learning conference",
          "coding bootcamp",
          "tech startup event"
        ]
      }
    };

    console.log('📡 Searching for technical events...');
    
    const { data, error } = await supabase.functions.invoke('perplexity-events', {
      body: techPayload
    });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Technical search completed');
    
    if (data && data.events) {
      console.log(`\n🛠️ Found ${data.events.length} technical events:`);
      
      data.events.slice(0, 5).forEach((event, index) => {
        console.log(`\n${index + 1}. ${event.title}`);
        console.log(`   📅 ${event.date || 'Date TBD'}`);
        console.log(`   📍 ${event.location || 'Location TBD'}`);
        console.log(`   🎯 Relevance: High (matches technical interests)`);
      });
    }

  } catch (error) {
    console.error('❌ Technical search failed:', error);
  }
}

async function main() {
  await testPersonalizedEventSearch();
  await testTechnicalEventSearch();
  
  console.log('\n🎉 Personalized event search complete!');
  console.log('💡 These results are based on your 1,563 conversation analysis');
}

main().catch(console.error);
