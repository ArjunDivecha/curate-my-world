// Test Google Maps integration
const testGoogleMaps = async () => {
  console.log('Testing Google Maps Geocoding API...');
  
  // Replace with your actual Google Maps API key
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY';
  const location = 'San Francisco, CA';
  
  try {
    // Geocode the location
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const coords = {
        lat: data.results[0].geometry.location.lat,
        lng: data.results[0].geometry.location.lng
      };
      console.log(`Geocoded ${location}:`, coords);
    } else {
      console.log('No results found for location');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testGoogleMaps();