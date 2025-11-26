/**
 * Test Whitelist Approaches
 * Compare Option A (site-specific search) vs Option C (includeDomains)
 */

import { config } from '../src/utils/config.js';

const TEST_DOMAINS = [
  'thefillmore.com',
  'sfjazz.org', 
  'sfopera.com'
];

const LOCATION = 'San Francisco';
const CATEGORY = 'music';

// =============================================================================
// OPTION A: Site-specific search queries
// =============================================================================
async function testOptionA_SiteSearch(domain) {
  console.log(`\n🔍 OPTION A: Site-specific search for ${domain}`);
  
  const query = `site:${domain} events 2025 ${LOCATION}`;
  console.log(`   Query: "${query}"`);
  
  try {
    // Test with Serper
    const serperResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': config.serperApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });
    
    const serperData = await serperResponse.json();
    const results = serperData.organic || [];
    
    console.log(`   ✅ Serper found ${results.length} results:`);
    results.slice(0, 5).forEach((r, i) => {
      console.log(`      ${i+1}. ${r.title?.substring(0, 60)}...`);
      console.log(`         ${r.link}`);
    });
    
    return { domain, approach: 'A', results: results.length, sample: results.slice(0, 3) };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { domain, approach: 'A', results: 0, error: error.message };
  }
}

// =============================================================================
// OPTION C: Exa includeDomains
// =============================================================================
async function testOptionC_IncludeDomains(domains) {
  console.log(`\n🔍 OPTION C: Exa includeDomains for ${domains.join(', ')}`);
  
  const query = `${CATEGORY} events ${LOCATION} 2025`;
  console.log(`   Query: "${query}"`);
  console.log(`   includeDomains: ${JSON.stringify(domains)}`);
  
  try {
    const exaResponse = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': config.exaApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        type: 'auto',
        numResults: 15,
        includeDomains: domains,
        contents: {
          text: { maxCharacters: 500 }
        }
      })
    });
    
    const exaData = await exaResponse.json();
    const results = exaData.results || [];
    
    console.log(`   ✅ Exa found ${results.length} results:`);
    results.slice(0, 5).forEach((r, i) => {
      console.log(`      ${i+1}. ${r.title?.substring(0, 60)}...`);
      console.log(`         ${r.url}`);
    });
    
    return { domains, approach: 'C', results: results.length, sample: results.slice(0, 3) };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { domains, approach: 'C', results: 0, error: error.message };
  }
}

// =============================================================================
// RUN TESTS
// =============================================================================
async function runTests() {
  console.log('='.repeat(70));
  console.log('WHITELIST APPROACH COMPARISON TEST');
  console.log('='.repeat(70));
  console.log(`Location: ${LOCATION}`);
  console.log(`Category: ${CATEGORY}`);
  console.log(`Test domains: ${TEST_DOMAINS.join(', ')}`);
  
  const results = {
    optionA: [],
    optionC: null
  };
  
  // Test Option A for each domain
  console.log('\n' + '='.repeat(70));
  console.log('OPTION A: Individual site: searches (via Serper)');
  console.log('='.repeat(70));
  
  for (const domain of TEST_DOMAINS) {
    const result = await testOptionA_SiteSearch(domain);
    results.optionA.push(result);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  
  // Test Option C with all domains
  console.log('\n' + '='.repeat(70));
  console.log('OPTION C: includeDomains (via Exa)');
  console.log('='.repeat(70));
  
  results.optionC = await testOptionC_IncludeDomains(TEST_DOMAINS);
  
  // Collect all URLs for overlap analysis
  const optionA_URLs = new Set();
  const optionA_AllResults = [];
  results.optionA.forEach(r => {
    if (r.sample) {
      r.sample.forEach(item => {
        const url = item.link || item.url;
        if (url) {
          optionA_URLs.add(url);
          optionA_AllResults.push({ url, title: item.title });
        }
      });
    }
  });
  
  const optionC_URLs = new Set();
  const optionC_AllResults = [];
  if (results.optionC.sample) {
    results.optionC.sample.forEach(item => {
      const url = item.link || item.url;
      if (url) {
        optionC_URLs.add(url);
        optionC_AllResults.push({ url, title: item.title });
      }
    });
  }
  
  // Calculate overlap
  const overlap = [...optionA_URLs].filter(url => optionC_URLs.has(url));
  const onlyInA = [...optionA_URLs].filter(url => !optionC_URLs.has(url));
  const onlyInC = [...optionC_URLs].filter(url => !optionA_URLs.has(url));
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  
  const totalA = results.optionA.reduce((sum, r) => sum + r.results, 0);
  console.log(`\nOption A (site: searches): ${totalA} total results`);
  results.optionA.forEach(r => {
    console.log(`   ${r.domain}: ${r.results} results`);
  });
  
  console.log(`\nOption C (includeDomains): ${results.optionC.results} results`);
  
  console.log('\n' + '='.repeat(70));
  console.log('OVERLAP ANALYSIS (based on sample URLs)');
  console.log('='.repeat(70));
  
  console.log(`\n📊 URL Comparison:`);
  console.log(`   Option A unique URLs (sample): ${optionA_URLs.size}`);
  console.log(`   Option C unique URLs (sample): ${optionC_URLs.size}`);
  console.log(`   Overlap: ${overlap.length} URLs appear in BOTH`);
  console.log(`   Only in Option A: ${onlyInA.length}`);
  console.log(`   Only in Option C: ${onlyInC.length}`);
  
  if (overlap.length > 0) {
    console.log(`\n🔄 Overlapping URLs:`);
    overlap.forEach(url => console.log(`   ${url}`));
  }
  
  if (onlyInA.length > 0) {
    console.log(`\n🅰️  Only in Option A:`);
    onlyInA.forEach(url => console.log(`   ${url}`));
  }
  
  if (onlyInC.length > 0) {
    console.log(`\n🅲  Only in Option C:`);
    onlyInC.forEach(url => console.log(`   ${url}`));
  }
  
  const combinedUnique = new Set([...optionA_URLs, ...optionC_URLs]);
  console.log(`\n📈 Combined Coverage:`);
  console.log(`   Using BOTH approaches: ${combinedUnique.size} unique URLs`);
  console.log(`   Overlap rate: ${((overlap.length / Math.min(optionA_URLs.size, optionC_URLs.size)) * 100).toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATION');
  console.log('='.repeat(70));
  
  if (overlap.length === 0) {
    console.log('→ NO OVERLAP! Both approaches find completely different results.');
    console.log('→ Using BOTH gives maximum coverage.');
  } else if (overlap.length < Math.min(optionA_URLs.size, optionC_URLs.size) / 2) {
    console.log('→ LOW OVERLAP - Both approaches complement each other well.');
    console.log('→ Using BOTH recommended for better coverage.');
  } else {
    console.log('→ HIGH OVERLAP - Approaches find similar results.');
    console.log('→ Could use just one approach to save API costs.');
  }
}

runTests().catch(console.error);

