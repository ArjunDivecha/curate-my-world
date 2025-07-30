#!/usr/bin/env python3
"""
Quick provider test - simplified version with better error handling
"""

import requests
import json
import time

# Test PredictHQ directly with better location handling
def test_predicthq_quick():
    print("=== Testing PredictHQ API ===")
    
    # Try different location approaches
    locations_to_try = [
        ("Los Angeles", "q"),
        ("Los Angeles, CA", "q"), 
        ("california", "q"),
        ("us", "place.scope")
    ]
    
    for location, param_type in locations_to_try:
        try:
            print(f"\nTrying {param_type}='{location}'...")
            
            url = "https://api.predicthq.com/v1/events"
            params = {
                'category': 'performing-arts',
                param_type: location,
                'limit': 5,
                'sort': 'start'
            }
            
            headers = {
                'Authorization': 'Bearer 8K2-8oWxCmuJ09HuFBwafivPpoK3Dqmab0qpmEkR',
                'Accept': 'application/json'
            }
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('results', [])
                print(f"✅ SUCCESS: Found {len(events)} events (of {data.get('count', 0)} total)")
                
                if events:
                    for i, event in enumerate(events[:2]):
                        print(f"  {i+1}. {event.get('title', 'Untitled')}")
                        print(f"     Location: {event.get('geo', {}).get('address', {}).get('locality', 'Unknown')}")
                        print(f"     Date: {event.get('start_local', 'TBD')}")
                return True
            else:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                print(f"❌ Error: {response.status_code} - {error_data.get('error', error_data.get('message', 'Unknown'))}")
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
    
    return False

# Test our Node.js API with single endpoint
def test_our_api_quick():
    print("\n=== Testing Our Node.js API ===")
    
    try:
        print("Testing Perplexity endpoint...")
        start_time = time.time()
        
        url = "http://127.0.0.1:3001/api/events/comedy"
        params = {'location': 'Los Angeles, CA', 'limit': 5}
        
        response = requests.get(url, params=params, timeout=90)  # Longer timeout
        duration = (time.time() - start_time) * 1000
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"✅ SUCCESS: Found {data.get('count', 0)} events in {duration:.0f}ms")
                
                events = data.get('events', [])
                if events:
                    for i, event in enumerate(events[:2]):
                        print(f"  {i+1}. {event.get('title', 'Untitled')}")
                        print(f"     Venue: {event.get('venue', 'Unknown')}")
                        print(f"     Date: {event.get('date', event.get('startDate', 'TBD'))}")
                return True
            else:
                print(f"❌ API Error: {data.get('error', 'Unknown error')}")
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out after 90 seconds")
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
    
    return False

# Test Apyflux directly via comparison endpoint
def test_apyflux_quick():
    print("\n=== Testing Apyflux via Compare Endpoint ===")
    
    try:
        print("Testing Apyflux comparison endpoint...")
        start_time = time.time()
        
        url = "http://127.0.0.1:3001/api/events/comedy/compare"
        params = {'location': 'Los Angeles, CA', 'limit': 5}
        
        response = requests.get(url, params=params, timeout=90)
        duration = (time.time() - start_time) * 1000
        
        if response.status_code == 200:
            data = response.json()
            apyflux_data = data.get('comparison', {}).get('apyflux', {})
            
            if apyflux_data.get('success'):
                count = apyflux_data.get('count', 0)
                print(f"✅ SUCCESS: Found {count} events in {duration:.0f}ms")
                
                events = apyflux_data.get('events', [])
                if events:
                    for i, event in enumerate(events[:2]):
                        print(f"  {i+1}. {event.get('title', event.get('name', 'Untitled'))}")
                        print(f"     Venue: {event.get('venue', event.get('venueInfo', {}).get('name', 'Unknown'))}")
                        print(f"     Date: {event.get('dateHuman', event.get('startDate', 'TBD'))}")
                return True
            else:
                print(f"❌ Apyflux Error: {apyflux_data.get('error', 'Unknown error')}")
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out after 90 seconds")
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
    
    return False

if __name__ == '__main__':
    print("🎭 QUICK PROVIDER TEST")
    print("Testing all providers with better error handling...")
    
    # Test each provider
    results = []
    results.append(("PredictHQ", test_predicthq_quick()))
    results.append(("Our API (Perplexity)", test_our_api_quick()))
    results.append(("Apyflux", test_apyflux_quick()))
    
    print("\n" + "="*50)
    print("SUMMARY:")
    for provider, success in results:
        status = "✅ Working" if success else "❌ Failed"
        print(f"{provider}: {status}")
    
    working_count = sum(1 for _, success in results if success)
    print(f"\nTotal working providers: {working_count}/3")