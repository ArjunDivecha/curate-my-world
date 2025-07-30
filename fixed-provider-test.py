#!/usr/bin/env python3
"""
Fixed Multi-Provider Testing Tool
Handles connection issues and proper timeouts
"""

import requests
import json
import time
from datetime import datetime

# Configuration
API_BASE = 'http://127.0.0.1:3001/api'
PREDICTHQ_KEY = '8K2-8oWxCmuJ09HuFBwafivPpoK3Dqmab0qpmEkR'
TIMEOUT = 120  # 2 minutes

def test_provider(name, url, params, headers=None):
    """Test a single provider with proper error handling"""
    print(f"\n--- Testing {name} ---")
    print(f"URL: {url}")
    print(f"Params: {params}")
    
    start_time = time.time()
    
    try:
        # Create a new session for each request
        session = requests.Session()
        session.headers.update({'Connection': 'close'})
        
        if headers:
            session.headers.update(headers)
        
        response = session.get(url, params=params, timeout=TIMEOUT)
        duration = (time.time() - start_time) * 1000
        
        if response.status_code == 200:
            data = response.json()
            
            # Handle different response formats
            if name == "Perplexity":
                success = data.get('success', False)
                count = data.get('count', 0)
                events = data.get('events', [])
            elif name == "Apyflux":
                apyflux_data = data.get('comparison', {}).get('apyflux', {})
                success = apyflux_data.get('success', False)
                count = apyflux_data.get('count', 0)
                events = apyflux_data.get('events', [])
            elif name == "Combined":
                success = data.get('success', False)
                count = data.get('count', 0)
                events = data.get('events', [])
            elif name == "PredictHQ":
                success = 'results' in data
                count = len(data.get('results', []))
                events = data.get('results', [])
            
            if success and count > 0:
                print(f"✅ SUCCESS: {count} events in {duration:.0f}ms")
                
                # Show sample events
                for i, event in enumerate(events[:2]):
                    if name == "PredictHQ":
                        print(f"  {i+1}. {event.get('title', 'Unknown')}")
                        print(f"     Location: {event.get('geo', {}).get('address', {}).get('locality', 'Unknown')}")
                        print(f"     Date: {event.get('start_local', 'Unknown')}")
                    else:
                        print(f"  {i+1}. {event.get('title', event.get('name', 'Unknown'))}")
                        print(f"     Venue: {event.get('venue', event.get('venueInfo', {}).get('name', 'Unknown'))}")
                        print(f"     Date: {event.get('date', event.get('dateHuman', event.get('startDate', 'Unknown')))}")
                
                return {'success': True, 'count': count, 'duration': duration}
            else:
                error_msg = data.get('error', 'No events found')
                print(f"❌ API Error: {error_msg}")
                return {'success': False, 'error': error_msg, 'count': 0, 'duration': duration}
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            return {'success': False, 'error': f'HTTP {response.status_code}', 'count': 0, 'duration': duration}
            
    except requests.exceptions.Timeout:
        duration = (time.time() - start_time) * 1000
        print(f"❌ Timeout after {duration:.0f}ms")
        return {'success': False, 'error': 'Timeout', 'count': 0, 'duration': duration}
    except requests.exceptions.ConnectionError as e:
        duration = (time.time() - start_time) * 1000
        print(f"❌ Connection Error: {str(e)[:100]}...")
        return {'success': False, 'error': 'Connection error', 'count': 0, 'duration': duration}
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        print(f"❌ Unexpected Error: {str(e)}")
        return {'success': False, 'error': str(e), 'count': 0, 'duration': duration}

def test_all_providers(category, location, limit=10):
    """Test all providers for a given category and location"""
    print("="*80)
    print(f"TESTING ALL PROVIDERS - {category.upper()} in {location}")
    print("="*80)
    
    results = {}
    
    # Test Perplexity
    results['perplexity'] = test_provider(
        "Perplexity",
        f"{API_BASE}/events/{category}",
        {'location': location, 'limit': limit}
    )
    
    # Small delay between requests
    time.sleep(2)
    
    # Test Apyflux via compare endpoint
    results['apyflux'] = test_provider(
        "Apyflux", 
        f"{API_BASE}/events/{category}/compare",
        {'location': location, 'limit': limit}
    )
    
    # Small delay between requests
    time.sleep(2)
    
    # Test PredictHQ directly
    category_mapping = {
        'theatre': 'performing-arts',
        'theater': 'performing-arts',
        'music': 'concerts', 
        'concerts': 'concerts',
        'comedy': 'performing-arts',
        'sports': 'sports',
        'food': 'festivals',
        'art': 'expos',
        'lectures': 'conferences'
    }
    
    phq_category = category_mapping.get(category.lower(), 'performing-arts')
    location_query = location.split(',')[0].strip()
    
    results['predicthq'] = test_provider(
        "PredictHQ",
        "https://api.predicthq.com/v1/events",
        {
            'category': phq_category,
            'q': location_query,
            'limit': limit,
            'sort': 'start'
        },
        {
            'Authorization': f'Bearer {PREDICTHQ_KEY}',
            'Accept': 'application/json'
        }
    )
    
    # Small delay before combined test
    time.sleep(2)
    
    # Test Combined API
    results['combined'] = test_provider(
        "Combined",
        f"{API_BASE}/events/{category}/combined", 
        {'location': location, 'limit': limit}
    )
    
    # Print summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    for provider, result in results.items():
        status = "✅ SUCCESS" if result['success'] else "❌ FAILED"
        count = result['count']
        duration = f"{result['duration']:.0f}ms"
        print(f"{provider.upper():12} {status:12} {count:3} events in {duration:8}")
    
    # Best performer
    successful = {k: v for k, v in results.items() if v['success']}
    if successful:
        best_count = max(successful.values(), key=lambda x: x['count'])
        fastest = min(successful.values(), key=lambda x: x['duration'])
        print(f"\n🏆 Most events: {[k for k, v in successful.items() if v['count'] == best_count['count']][0].upper()} ({best_count['count']} events)")
        print(f"⚡ Fastest: {[k for k, v in successful.items() if v['duration'] == fastest['duration']][0].upper()} ({fastest['duration']:.0f}ms)")
    
    return results

if __name__ == '__main__':
    # Test scenarios
    test_scenarios = [
        ('art', 'Chicago, IL', 10),
        ('music', 'New York, NY', 10), 
        ('comedy', 'Los Angeles, CA', 8),
        ('theatre', 'San Francisco, CA', 10)
    ]
    
    print("🎭 FIXED MULTI-PROVIDER TEST TOOL")
    print("Testing with proper connection handling...")
    
    # Interactive mode
    print("\nSelect test:")
    for i, (cat, loc, lim) in enumerate(test_scenarios, 1):
        print(f"  {i}. {cat.title()} in {loc} (limit {lim})")
    print("  5. Custom test")
    
    try:
        choice = input("\nEnter choice (1-5): ").strip()
        
        if choice in ['1', '2', '3', '4']:
            cat, loc, lim = test_scenarios[int(choice) - 1]
            test_all_providers(cat, loc, lim)
        elif choice == '5':
            cat = input("Category: ").strip() or 'music'
            loc = input("Location: ").strip() or 'San Francisco, CA' 
            lim = int(input("Limit: ").strip() or '10')
            test_all_providers(cat, loc, lim)
        else:
            print("Invalid choice")
            
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    except Exception as e:
        print(f"Error: {e}")