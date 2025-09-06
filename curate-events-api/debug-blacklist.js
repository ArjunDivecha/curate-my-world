#!/usr/bin/env node

import { minimatch } from 'minimatch';

const url = 'https://encrypted-tbn0.gstatic.com/images/test.jpg';
const pattern1 = 'encrypted-tbn0.gstatic.com/*';
const pattern2 = 'encrypted-tbn0.gstatic.com/**';

// Clean URL (remove protocol)
const cleanUrl = url.split('://', 2)[1]; // encrypted-tbn0.gstatic.com/images/test.jpg

console.log('URL:', url);
console.log('Clean URL:', cleanUrl);
console.log('Pattern 1 (*):', pattern1);
console.log('  Direct match:', minimatch(cleanUrl, pattern1));
console.log('  URL match:', minimatch(url, pattern1));
console.log('Pattern 2 (**):', pattern2);
console.log('  Direct match:', minimatch(cleanUrl, pattern2));
console.log('  URL match:', minimatch(url, pattern2));

// Test other patterns
console.log('\nOther tests:');
console.log('google.com/* vs google.com/search:', minimatch('google.com/search', 'google.com/*'));
console.log('google.com/* vs google.com/search/deep:', minimatch('google.com/search/deep', 'google.com/*'));
console.log('google.com/** vs google.com/search/deep:', minimatch('google.com/search/deep', 'google.com/**'));