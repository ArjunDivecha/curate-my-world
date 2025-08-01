import { EventParser } from './src/parsers/EventParser.js';

const parser = new EventParser();

// Test events with obvious categorization mismatches
const testEvents = [
  {
    title: 'Jazz Night at Blue Note',
    description: 'Live jazz performance featuring local musicians',
    venue: 'Blue Note Jazz Club',
    originalCategory: 'food'
  },
  {
    title: 'Art Exhibition Opening',
    description: 'Contemporary art exhibition featuring local artists',
    venue: 'Downtown Art Gallery', 
    originalCategory: 'music'
  },
  {
    title: 'Pizza Making Workshop',
    description: 'Learn to make authentic Italian pizza',
    venue: 'Culinary Institute',
    originalCategory: 'theatre'
  },
  {
    title: 'Shakespeare in the Park',
    description: 'Outdoor theatrical performance of Romeo and Juliet',
    venue: 'Community Theater',
    originalCategory: 'food'
  },
  {
    title: 'Avengers Endgame Screening',
    description: 'Special IMAX screening of the Marvel blockbuster',
    venue: 'AMC Theater',
    originalCategory: 'music'
  }
];

console.log('=== Content-Based Categorization Test ===');
testEvents.forEach((test, i) => {
  console.log(`\nTest ${i + 1}: ${test.title}`);
  console.log(`Original Category: ${test.originalCategory}`);
  
  const result = parser.reCategorizeEvent(test, test.originalCategory);
  console.log(`Final Category: ${result}`);
  console.log(`Corrected: ${result !== test.originalCategory ? 'YES' : 'NO'}`);
});