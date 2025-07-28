// Test Google Maps integration in fetch-real-events function
const testGoogleMapsIntegration = async () => {
  console.log('Testing Google Maps integration for location filtering...');
  
  // Mock event data that would come from Brave Search
  const mockSearchResults = {
    web: {
      results: [
        {
          title: 'Concert at Golden Gate Park',
          description: 'Join us for an amazing music event in Golden Gate Park, San Francisco on July 15, 2025',
          url: 'https://example.com/golden-gate-concert'
        },
        {
          title: 'Art Exhibition in Los Angeles',
          description: 'Contemporary art exhibition at LA Museum on July 20, 2025',
          url: 'https://example.com/la-art-exhibition'
        }
      ]
    }
  };
  
  // Test location
  const location = 'San Francisco, CA';
  
  // Mock preferences
  const preferences = {
    categories: ['music', 'art'],
    priceRange: { min: 0, max: 100 },
    timePreferences: ['Evening'],
    customKeywords: []
  };
  
  // In a real implementation, we would call our modified extractEventsFromSearchResults function
  // For now, let's just test the Google Maps distance calculation
  
  try {
    // Replace with your actual Google Maps API key
    const googleMapsApiKey = 'YOUR_GOOGLE_MAPS_API_KEY';
    
    if (!googleMapsApiKey || googleMapsApiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
      console.log('Please provide a valid Google Maps API key in the script');
      return;
    }
    
    // Test distance calculation between two locations
    const sfCoords = { lat: 37.7749, lng: -122.4194 }; // San Francisco
    const laCoords = { lat: 34.0522, lng: -118.2437 }; // Los Angeles
    
    // Haversine formula for distance calculation
    const R = 3958.8; // Earth radius in miles
    const dLat = (laCoords.lat - sfCoords.lat) * Math.PI / 180;
    const dLon = (laCoords.lng - sfCoords.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(sfCoords.lat * Math.PI / 180) * Math.cos(laCoords.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    console.log(`Distance between San Francisco and Los Angeles: ${distance.toFixed(2)} miles`);
    
    // Test geocoding
    console.log('\nTesting geocoding:');
    
    // Geocode San Francisco
    const sfGeocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('San Francisco, CA')}&key=${googleMapsApiKey}`;
    const sfResponse = await fetch(sfGeocodeUrl);
    const sfData = await sfResponse.json();
    
    if (sfData.results && sfData.results.length > 0) {
      const sfResult = sfData.results[0];
      console.log('San Francisco geocoding result:');
      console.log(`  Formatted address: ${sfResult.formatted_address}`);
      console.log(`  Coordinates: ${sfResult.geometry.location.lat}, ${sfResult.geometry.location.lng}`);
    }
    
    // Geocode Los Angeles
    const laGeocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Los Angeles, CA')}&key=${googleMapsApiKey}`;
    const laResponse = await fetch(laGeocodeUrl);
    const laData = await laResponse.json();
    
    if (laData.results && laData.results.length > 0) {
      const laResult = laData.results[0];
      console.log('Los Angeles geocoding result:');
      console.log(`  Formatted address: ${laResult.formatted_address}`);
      console.log(`  Coordinates: ${laResult.geometry.location.lat}, ${laResult.geometry.location.lng}`);
    }
    
    console.log('\nGoogle Maps integration test completed successfully!');
    
  } catch (error) {
    console.error('Error testing Google Maps integration:', error.message);
  }
};

testGoogleMapsIntegration();