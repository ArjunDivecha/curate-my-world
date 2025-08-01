import { EventParser } from './src/parsers/EventParser.js';

const parser = new EventParser();

// Debug the scoring for events that didn't get recategorized
const debugEvents = [
  {
    title: 'Jazz Night at Blue Note',
    description: 'Live jazz performance featuring local musicians',
    venue: 'Blue Note Jazz Club',
    originalCategory: 'food'
  },
  {
    title: 'Pizza Making Workshop',
    description: 'Learn to make authentic Italian pizza',
    venue: 'Culinary Institute',
    originalCategory: 'theatre'
  }
];

console.log('=== Debug Categorization Scoring ===');

// Add debug logging to see all scores
debugEvents.forEach((test, i) => {
  console.log(`\nDebug Test ${i + 1}: ${test.title}`);
  console.log(`Original Category: ${test.originalCategory}`);
  
  // Get category manager data
  const categoryKeywords = parser.categoryManager.getAllCategoryKeywords();
  const venueCategoryMap = parser.categoryManager.getVenueCategoryMap();
  
  // Analyze event content
  const analysisText = `${test.title || ''} ${test.description || ''} ${test.venue || ''}`.toLowerCase();
  console.log(`Analysis Text: "${analysisText}"`);
  
  // Score each category
  const categoryScores = {};
  
  // 1. Venue-based categorization
  const venueText = (test.venue || '').toLowerCase();
  console.log(`Venue Text: "${venueText}"`);
  
  for (const [category, venuePatterns] of Object.entries(venueCategoryMap)) {
    let venueScore = 0;
    
    for (const pattern of venuePatterns) {
      if (venueText.includes(pattern.toLowerCase())) {
        console.log(`  Venue match: "${pattern}" in category "${category}"`);
        if (venueText === pattern.toLowerCase()) {
          venueScore = Math.max(venueScore, 1.0);
        } else {
          venueScore = Math.max(venueScore, 0.8);
        }
      }
    }
    
    if (venueScore > 0) {
      console.log(`  Venue score for ${category}: ${venueScore}`);
    }
    categoryScores[category] = (categoryScores[category] || 0) + venueScore * 0.6;
  }
  
  // 2. Keyword-based categorization
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const keywordScore = keywords.reduce((score, keyword) => {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'g');
      const matches = (analysisText.match(regex) || []).length;
      if (matches > 0) {
        console.log(`  Keyword match: "${keyword}" in category "${category}" (${matches} times)`);
      }
      return score + matches;
    }, 0);
    
    const normalizedKeywordScore = Math.min(keywordScore / 5, 1.0);
    if (normalizedKeywordScore > 0) {
      console.log(`  Keyword score for ${category}: ${normalizedKeywordScore}`);
    }
    categoryScores[category] = (categoryScores[category] || 0) + normalizedKeywordScore * 0.4;
  }
  
  // Show all scores
  console.log('Final scores:');
  Object.entries(categoryScores)
    .sort(([,a], [,b]) => b - a)
    .forEach(([cat, score]) => {
      if (score > 0) {
        console.log(`  ${cat}: ${score.toFixed(3)}`);
      }
    });
  
  const bestMatch = Object.entries(categoryScores)
    .sort(([,a], [,b]) => b - a)[0];
  const [bestCategory, bestScore] = bestMatch || [test.originalCategory, 0];
  
  console.log(`Best match: ${bestCategory} (${bestScore.toFixed(3)})`);
  console.log(`Would recategorize: ${bestScore > 0.7 && bestCategory !== test.originalCategory ? 'YES' : 'NO'}`);
});