// Test OpenAI directly to see if the AI analysis works
const testOpenAIDirect = async () => {
  console.log('🤖 Testing OpenAI API directly...');
  
  const samplePageContent = `
    San Francisco Events Calendar 2025
    
    Upcoming Concerts and Shows:
    
    1. The Strokes Live Concert
       Date: August 15, 2025
       Venue: The Fillmore
       Price: $45-85
       
    2. Jazz Festival at Golden Gate Park
       Date: September 3, 2025
       Venue: Golden Gate Park
       Price: Free
       
    3. Electronic Music Night
       Date: August 22, 2025
       Venue: The Independent
       Price: $25-40
       
    4. Classical Symphony Performance
       Date: September 10, 2025
       Venue: Davies Symphony Hall
       Price: $30-120
  `;
  
  try {
    console.log('📡 Calling OpenAI API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || 'your-api-key-here'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing web pages to extract event information. Your task is to:
1. Determine if this page contains multiple events (portfolio/calendar page)
2. If yes, extract individual events with structured data
3. Return ONLY a JSON array of events, no other text

Each event should have:
- title: string (event name)
- description: string (brief description)
- venue: string (venue name or location)
- date: string (ISO date format, use 2025 if year missing)
- time: string (time if available, or estimate)
- price: string (price info if available)
- category: string (music, art, food, etc.)

If this is NOT a portfolio page with multiple events, return an empty array [].
Location context: San Francisco, CA
User preferences: {"categories":["Music"],"customKeywords":["concert"]}`
          },
          {
            role: 'user',
            content: `Page Title: San Francisco Events Calendar 2025\n\nPage Description: Find the best events in San Francisco\n\nPage Content:\n${samplePageContent}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });
    
    console.log('📊 OpenAI Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ OpenAI API error:', errorText);
      return;
    }
    
    const result = await response.json();
    const aiContent = result.choices?.[0]?.message?.content;
    
    console.log('🤖 AI Response:', aiContent);
    
    // Try to parse the JSON
    try {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const events = JSON.parse(jsonMatch[0]);
        console.log(`\n✅ Successfully parsed ${events.length} events:`);
        events.forEach((event, index) => {
          console.log(`${index + 1}. ${event.title}`);
          console.log(`   📅 Date: ${event.date}`);
          console.log(`   📍 Venue: ${event.venue}`);
          console.log(`   💰 Price: ${event.price}`);
          console.log(`   🏷️ Category: ${event.category}`);
          console.log('');
        });
      } else {
        console.log('❌ No JSON array found in response');
      }
    } catch (parseError) {
      console.log('❌ Failed to parse AI response as JSON:', parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testOpenAIDirect();
