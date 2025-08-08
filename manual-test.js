// Manual test script to verify category filtering
console.log('🧪 Manual Category Filtering Test');

// Step 1: Simulate clicking Fetch Events button
console.log('📡 Step 1: Looking for Fetch Events button...');
const fetchButton = document.querySelector('button[class*="btn-primary"]');
if (fetchButton && fetchButton.textContent.includes('Fetch Events')) {
  console.log('✅ Found Fetch Events button, clicking...');
  fetchButton.click();
  
  // Step 2: Wait for events to load, then test category filtering
  setTimeout(() => {
    console.log('🎯 Step 2: Testing Technology category click...');
    
    // Look for Technology category in suggested categories
    const suggestedButtons = document.querySelectorAll('button');
    let technologyButton = null;
    
    suggestedButtons.forEach(button => {
      if (button.textContent.includes('Show Events')) {
        const parentDiv = button.closest('div');
        if (parentDiv && parentDiv.textContent.includes('Technology')) {
          technologyButton = button;
        }
      }
    });
    
    if (technologyButton) {
      console.log('✅ Found Technology Show Events button');
      console.log('🖱️ Clicking Technology category...');
      technologyButton.click();
      
      // Step 3: Check results
      setTimeout(() => {
        console.log('📊 Step 3: Checking filtered results...');
        console.log('✅ Test completed! Check console logs above for detailed filtering process.');
      }, 2000);
    } else {
      console.log('❌ Technology Show Events button not found');
      console.log('Available buttons with "Show Events":', 
        Array.from(suggestedButtons)
          .filter(b => b.textContent.includes('Show Events'))
          .map(b => b.closest('div')?.textContent?.substring(0, 100))
      );
    }
  }, 8000); // Wait 8 seconds for events to load
} else {
  console.log('❌ Fetch Events button not found');
  console.log('Available buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.substring(0, 30)));
}
