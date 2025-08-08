// Test script to simulate clicking Technology category
console.log('🎯 Testing Technology Category Click...');

// Find and click the Technology "Show Events" button
const buttons = document.querySelectorAll('button');
let technologyButton = null;

buttons.forEach(button => {
  if (button.textContent.includes('Show Events')) {
    const card = button.closest('div');
    if (card && card.textContent.includes('Technology')) {
      technologyButton = button;
    }
  }
});

if (technologyButton) {
  console.log('✅ Found Technology Show Events button');
  console.log('🖱️ Clicking Technology category...');
  technologyButton.click();
  
  // Check results after a short delay
  setTimeout(() => {
    console.log('📊 Checking filtered results...');
    
    // Look for event cards or indicators
    const eventElements = document.querySelectorAll('[class*="event"], [class*="Event"]');
    console.log('📋 Event elements found:', eventElements.length);
    
    // Check the events state in Dashboard component
    console.log('🔍 Technology category filtering test completed!');
    console.log('💡 Check the console logs above for category filtering details');
  }, 1000);
} else {
  console.log('❌ Technology Show Events button not found');
  console.log('Available buttons:', Array.from(buttons).map(b => b.textContent.substring(0, 30)));
}
