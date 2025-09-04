#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: multi-provider-tester.py
=============================================================================

DESCRIPTION:
Interactive Python program to test various prompts with all four event providers:
- Perplexity AI (via backend API)
- PredictHQ API (via backend API)
- Exa API (direct API call)
- SerpAPI (direct API call)

Allows you to experiment with different search queries, categories, and locations
to compare results across all providers.

USAGE:
python multi-provider-tester.py

FEATURES:
- Interactive prompt selection
- Custom query testing
- Side-by-side result comparison
- Detailed response analysis
- Save results to files
- Performance metrics

VERSION: 1.0
LAST UPDATED: 2025-01-30
AUTHOR: Claude Code

DEPENDENCIES:
- requests
- json
- datetime
- tabulate (pip install tabulate)

NOTES:
- Requires Node.js API server running on localhost:8765
- PredictHQ API key included for direct testing
- SerpAPI and Exa API keys included for direct testing
- Results saved to outputs/ directory
=============================================================================
"""

import os
from dotenv import load_dotenv
load_dotenv(dotenv_path="/Users/macbook2024/Library/CloudStorage/Dropbox/AAA Backup/A Working/Curate-My-World/curate-events-api/.env")
import requests
import json
import sys
import random
from datetime import datetime
from typing import Dict, List, Optional, Any
import time

try:
    from tabulate import tabulate
except ImportError:
    print("Installing required package: tabulate")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tabulate"])
    from tabulate import tabulate

"""
PORT MANAGEMENT (see PORT_MANAGEMENT.md):
- Backend API: http://127.0.0.1:8765/api
- Frontend Dev Server: http://127.0.0.1:8766

To start the backend:
    npm run start:backend
or
    ./scripts/start-all.sh

If you see connection errors, verify the backend is running on port 8765.
"""

# Configuration
CONFIG = {
    'API_BASE_URL': 'http://127.0.0.1:8765/api',
    'PREDICTHQ_API_KEY': os.getenv('PREDICTHQ_API_KEY'),
    'PREDICTHQ_BASE_URL': 'https://api.predicthq.com/v1',
    'DEFAULT_LIMIT': 100,
    'TIMEOUT': 90
}

# Color codes for console output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def colorize(text: str, color: str) -> str:
    """Add color to text for console output"""
    return f"{color}{text}{Colors.ENDC}"

def print_header(text: str):
    """Print a formatted header"""
    print("\n" + "="*80)
    print(colorize(text.center(80), Colors.HEADER + Colors.BOLD))
    print("="*80)

def print_section(text: str):
    """Print a formatted section header"""
    print("\n" + colorize(f"--- {text} ---", Colors.OKCYAN + Colors.BOLD))

def print_success(text: str):
    """Print success message"""
    print(colorize(f"✅ {text}", Colors.OKGREEN))

def print_error(text: str):
    """Print error message"""
    print(colorize(f"❌ {text}", Colors.FAIL))

def print_warning(text: str):
    """Print warning message"""
    print(colorize(f"⚠️  {text}", Colors.WARNING))

def print_info(text: str):
    """Print info message"""
    print(colorize(f"ℹ️  {text}", Colors.OKBLUE))

class ProviderTester:
    """Test class for event providers"""
    
    def __init__(self):
        self.results = []
        self.session_start = datetime.now()
    
    def test_all_providers(self, category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Test all providers via backend API and extract Perplexity, PredictHQ, Exa, SerpAPI"""
        try:
            print_section("Testing All Providers (Perplexity, PredictHQ, Exa, SerpAPI)")
            start_time = time.time()
            url = f"{CONFIG['API_BASE_URL']}/events/{category}"
            # Add cache-busting timestamp to ensure fresh results
            time.sleep(0.1)  # Small delay to ensure unique timestamps
            cache_buster = f"{int(time.time() * 1000000)}_{random.randint(1000, 9999)}"  # Use microseconds + random for better uniqueness
            params = {'location': location, 'limit': limit, '_t': cache_buster}
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            session = requests.Session()
            # Add cache-busting headers
            headers = {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
            response = session.get(url, params=params, headers=headers, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            if response.status_code == 200:
                data = response.json()
                results = []
                for provider in ['perplexity', 'predicthq', 'exa', 'serpapi']:
                    prov = data.get('sourceStats', {}).get(provider, {})
                    results.append({
                        'provider': provider,
                        'success': prov.get('count', 0) > 0,
                        'count': prov.get('count', 0),
                        'duration_ms': prov.get('processingTime', 'N/A'),
                        'error': prov.get('error', None)
                    })
                
                return {
                    'results': results,
                    'duration': duration,
                    'raw': data
                }
            else:
                print_error(f"API Error: {response.text}")
                return {'results': [], 'duration': duration, 'raw': {}}
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {'results': [], 'duration': 0, 'raw': {}}
    
    def test_perplexity(self, category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Test Perplexity API via our Node.js endpoint"""
        try:
            print_section("Testing Perplexity AI")
            start_time = time.time()
            
            url = f"{CONFIG['API_BASE_URL']}/events/{category}"
            # Add cache-busting timestamp to ensure fresh results
            time.sleep(0.1)  # Small delay to ensure unique timestamps
            cache_buster = f"{int(time.time() * 1000000)}_{random.randint(1000, 9999)}"  # Use microseconds + random for better uniqueness
            params = {
                'location': location,
                'limit': limit,
                '_t': cache_buster
            }
            
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            
            # Use a fresh session for each request to avoid connection pooling issues
            session = requests.Session()
            # Add cache-busting headers
            headers = {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
            response = session.get(url, params=params, headers=headers, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    print_success(f"Found {data.get('count', 0)} events in {duration:.0f}ms")
                    
                    # Show sample events
                    events = data.get('events', [])
                    if events:
                        print("\nSample Events:")
                        for i, event in enumerate(events[:3]):
                            print(f"  {i+1}. {event.get('title', 'Untitled')}")
                            print(f"     Venue: {event.get('venue', 'Unknown')}")
                            print(f"     Date: {event.get('date', event.get('startDate', 'TBD'))}")
                            print(f"     Confidence: {os.getenv('PERPLEXITY_API_KEY')}")
                    
                    return {
                        'provider': 'perplexity',
                        'success': True,
                        'count': data.get('count', 0),
                        'events': events,
                        'duration_ms': duration,
                        'processing_time': data.get('processingTime', 'N/A')
                    }
                else:
                    print_error(f"API Error: {data.get('error', 'Unknown error')}")
                    return {
                        'provider': 'perplexity',
                        'success': False,
                        'error': data.get('error', 'Unknown error'),
                        'count': 0,
                        'events': [],
                        'duration_ms': duration
                    }
            else:
                print_error(f"HTTP {response.status_code}: {response.text}")
                return {
                    'provider': 'perplexity',
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
                
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'perplexity',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def test_predicthq(self, category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Test PredictHQ API directly"""
        try:
            print_section("Testing PredictHQ API")
            start_time = time.time()
            
            # Map categories to PredictHQ format
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
            
            # Handle location formatting for PredictHQ
            url = f"{CONFIG['PREDICTHQ_BASE_URL']}/events"
            
            if 'san francisco' in location.lower():
                # Use San Francisco coordinates with radius (same fix as JavaScript)
                params = {
                    'category': phq_category,
                    'location.within': '10km@37.7749,-122.4194',  # SF coordinates with 10km radius
                    'limit': limit,
                    'sort': 'start'
                }
            else:
                # For other locations, use general query
                location_query = location.split(',')[0].strip()
                params = {
                    'category': phq_category,
                    'q': location_query,
                    'limit': limit,
                    'sort': 'start'
                }
            
            headers = {
                'Authorization': f"Bearer {CONFIG['PREDICTHQ_API_KEY']}",
                'Accept': 'application/json'
            }
            
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            print_info(f"Category mapping: {category} -> {phq_category}")
            
            response = requests.get(url, params=params, headers=headers, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('results', [])
                total_count = data.get('count', 0)
                
                print_success(f"Found {len(events)} events (of {total_count} total) in {duration:.0f}ms")
                
                # Show sample events
                if events:
                    print("\nSample Events:")
                    for i, event in enumerate(events[:3]):
                        print(f"  {i+1}. {event.get('title', 'Untitled')}")
                        print(f"     Category: {event.get('category', 'Unknown')}")
                        print(f"     Date: {event.get('start_local', event.get('start', 'TBD'))}")
                        print(f"     Attendance: {event.get('phq_attendance', 'N/A')}")
                        print(f"     Rank: {event.get('rank', 'N/A')} (local: {event.get('local_rank', 'N/A')})")
                        print(f"     Location: {event.get('geo', {}).get('address', {}).get('locality', 'Unknown')}")
                
                return {
                    'provider': 'predicthq',
                    'success': True,
                    'count': len(events),
                    'total_available': total_count,
                    'events': events,
                    'duration_ms': duration
                }
            else:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                error_msg = error_data.get('error', error_data.get('message', f'HTTP {response.status_code}'))
                print_error(f"API Error: {error_msg}")
                return {
                    'provider': 'predicthq',
                    'success': False,
                    'error': error_msg,
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'predicthq',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def test_serpapi(self, category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Test SerpAPI directly"""
        try:
            print_section("Testing SerpAPI")
            start_time = time.time()
            
            # SerpAPI parameters
            params = {
                'engine': 'google_events',
                'q': f'{category} events in {location}',
                'hl': 'en',
                'api_key': os.getenv('SERPAPI_API_KEY')
            }
            
            url = 'https://serpapi.com/search'
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            
            # Use a fresh session for each request
            session = requests.Session()
            response = session.get(url, params=params, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('events_results', [])
                
                # Limit the results
                events = events[:limit]
                
                print_success(f"Found {len(events)} events in {duration:.0f}ms")
                
                # Show sample events
                if events:
                    print("\nSample Events:")
                    for i, event in enumerate(events[:3]):
                        print(f"  {i+1}. {event.get('title', 'Untitled')}")
                        venue = ', '.join(event.get('address', [])) if event.get('address') else 'Unknown'
                        date = event.get('date', {}).get('start_date', 'TBD')
                        print(f"     Venue: {venue}")
                        print(f"     Date: {date}")
                        print(f"     Source: serpapi")
                
                return {
                    'provider': 'serpapi',
                    'success': True,
                    'count': len(events),
                    'events': events,
                    'duration_ms': duration
                }
            else:
                print_error(f"HTTP {response.status_code}: {response.text}")
                return {
                    'provider': 'serpapi',
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
                
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'serpapi',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def test_exa(self, category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Test Exa API directly"""
        try:
            print_section("Testing Exa API")
            start_time = time.time()
            
            # Exa API parameters
            query = f'{category} events in {location} for the next 30 days'
            payload = {
                'query': query,
                'type': 'fast',
                'numResults': limit,
                'contents': {
                    'text': {
                        'maxCharacters': 2000
                    },
                    'summary': {
                        'query': 'For each event found, list its name, venue, full date, and a ticket link if available. Format as a list.',
                        'maxCharacters': 500
                    }
                }
            }
            
            headers = {
                'x-api-key': os.getenv('EXA_API_KEY'),
                'Content-Type': 'application/json'
            }
            
            url = 'https://api.exa.ai/search'
            print_info(f"URL: {url}")
            print_info(f"Payload: {payload}")
            
            # Use a fresh session for each request
            session = requests.Session()
            response = session.post(url, json=payload, headers=headers, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                events = data.get('results', [])
                
                print_success(f"Found {len(events)} events in {duration:.0f}ms")
                
                # Show sample events
                if events:
                    print("\nSample Events:")
                    for i, event in enumerate(events[:3]):
                        print(f"  {i+1}. {event.get('title', 'Untitled')}")
                        summary = event.get('summary', 'No summary available')
                        published_date = event.get('publishedDate', 'TBD')
                        print(f"     Summary: {summary[:100]}...")
                        print(f"     Date: {published_date}")
                        print(f"     Source: exa")
                
                return {
                    'provider': 'exa',
                    'success': True,
                    'count': len(events),
                    'events': events,
                    'duration_ms': duration
                }
            else:
                print_error(f"HTTP {response.status_code}: {response.text}")
                return {
                    'provider': 'exa',
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
                
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'exa',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def test_combined_from_results(self, individual_results: List[Dict[str, Any]], category: str, location: str, limit: int = 100) -> Dict[str, Any]:
        """Combine results from individual provider tests without re-running them"""
        try:
            print_section("Combining Results from All Providers")
            start_time = time.time()
            
            # Count total events from existing results
            total_events = sum(r.get('count', 0) for r in individual_results if r.get('success', False))
            total_duration = (time.time() - start_time) * 1000
            
            # Create sources dict from existing results
            sources = {}
            for result in individual_results:
                provider = result.get('provider', 'unknown')
                if result.get('success', False):
                    sources[provider] = {
                        'count': result.get('count', 0), 
                        'duration_ms': result.get('duration_ms', 0)
                    }
            
            print_success(f"Combined {total_events} total events from {len([r for r in individual_results if r.get('success', False)])} successful providers")
            print_info(f"Sources: Perplexity ({sources.get('perplexity', {}).get('count', 0)}), PredictHQ ({sources.get('predicthq', {}).get('count', 0)}), SerpAPI ({sources.get('serpapi', {}).get('count', 0)}), Exa ({sources.get('exa', {}).get('count', 0)})")
            
            return {
                'provider': 'all_providers',
                'success': True,
                'count': total_events,
                'events': [],
                'duration_ms': total_duration,
                'sources': sources
            }
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'all_providers',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def run_full_comparison(self, category: str, location: str, limit: int = 100):
        """Run full comparison of all providers"""
        print_header(f"FULL COMPARISON: {category.title()} in {location}")
        
        # Test all providers
        results = []
        
        # Test Perplexity
        result = self.test_perplexity(category, location, limit)
        results.append(result)
        
        # Test PredictHQ
        result = self.test_predicthq(category, location, limit)
        results.append(result)
        
        # Test SerpAPI
        result = self.test_serpapi(category, location, limit)
        results.append(result)
        
        # Test Exa
        result = self.test_exa(category, location, limit)
        results.append(result)
        
        # Test combined (reuse existing results)
        result = self.test_combined_from_results(results, category, location, limit)
        results.append(result)
        
        # Display results in table
        table_data = []
        for result in results:
            status = "✅ PASS" if result['success'] else "❌ FAIL"
            count = result.get('count', 0)
            duration = f"{result.get('duration_ms', 'N/A'):.0f}ms" if isinstance(result.get('duration_ms'), (int, float)) else str(result.get('duration_ms', 'N/A'))
            notes = result.get('error', 'Unknown error')[:30] if not result['success'] else ""
            
            table_data.append([
                result['provider'].upper(),
                status,
                count,
                duration,
                notes
            ])
        
        headers = ['Provider', 'Status', 'Count', 'Time', 'Notes']
        print(tabulate(table_data, headers=headers, tablefmt='grid'))
        
        # Best performers
        successful = [r for r in results if r['success']]
        if successful:
            most_events = max(successful, key=lambda r: r['count'])
            fastest = min(successful, key=lambda r: r['duration_ms'])
            
            print_success(f"Most events: {most_events['provider'].upper()} ({most_events['count']} events)")
            print_success(f"Fastest: {fastest['provider'].upper()} ({fastest['duration_ms']:.0f}ms)")
        
        # Save results
        self.results.append({
            'category': category,
            'location': location,
            'limit': limit,
            'timestamp': datetime.now().isoformat(),
            'results': results
        })
    
    def save_results(self, filename: Optional[str] = None):
        """Save all results to a JSON file"""
        if not self.results:
            print_warning("No results to save")
            return
            
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"outputs/provider_test_results_{timestamp}.json"
        
        try:
            import os
            os.makedirs(os.path.dirname(filename), exist_ok=True)
            
            with open(filename, 'w') as f:
                json.dump({
                    'session_start': self.session_start.isoformat(),
                    'session_end': datetime.now().isoformat(),
                    'total_tests': len(self.results),
                    'tests': self.results
                }, f, indent=2)
            
            print_success(f"Results saved to {filename}")
        except Exception as e:
            print_error(f"Failed to save results: {str(e)}")

def deduplicate_events(events_list):
    """Simple deduplication function that just returns events as they are"""
    # Flatten the list of events
    all_events = []
    for events in events_list:
        all_events.extend(events)
    
    return {
        'events': all_events,
        'duplicatesRemoved': 0,
        'totalProcessed': len(all_events)
    }

def show_menu():
    """Show the main menu"""
    print_header("MULTI-PROVIDER EVENT TESTING TOOL")
    print("\nChoose an option:")
    print("1. Quick test (preset prompts)")
    print("2. Custom test (your own parameters)")
    print("3. Bulk test (multiple scenarios)")
    print("4. View previous results")
    print("5. Exit")
    print()

def get_user_input(prompt: str, default: str = None) -> str:
    """Get user input with optional default"""
    if default:
        user_input = input(f"{prompt} [{default}]: ").strip()
        return user_input if user_input else default
    else:
        return input(f"{prompt}: ").strip()

def check_backend_api_available():
    import requests
    try:
        # Try a simple health check endpoint
        url = CONFIG['API_BASE_URL'] + '/health'
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return True
    except Exception:
        pass
    print_error(f"Cannot connect to backend API at {CONFIG['API_BASE_URL']}.\n\nMake sure your backend is running on port 8765!\nStart it with: npm run start:backend or ./scripts/start-all.sh\nSee PORT_MANAGEMENT.md for details.")
    return False

def main():
    if not check_backend_api_available():
        return
    """Main program loop"""
    tester = ProviderTester()
    
    # Preset test scenarios
    presets = [
        {'category': 'theatre', 'location': 'San Francisco, CA', 'limit': 10},
        {'category': 'music', 'location': 'New York, NY', 'limit': 15},
        {'category': 'comedy', 'location': 'Los Angeles, CA', 'limit': 8},
        {'category': 'art', 'location': 'Chicago, IL', 'limit': 12},
        {'category': 'food', 'location': 'Austin, TX', 'limit': 10}
    ]
    
    while True:
        show_menu()
        choice = input("Enter choice (1-5): ").strip()
        
        if choice == '1':
            print_header("QUICK TEST - PRESET SCENARIOS")
            print("Available presets:")
            for i, preset in enumerate(presets, 1):
                print(f"  {i}. {preset['category'].title()} in {preset['location']} (limit {preset['limit']})")
            
            try:
                preset_choice = int(input("\nSelect preset (1-5): ")) - 1
                if 0 <= preset_choice < len(presets):
                    preset = presets[preset_choice]
                    tester.run_full_comparison(preset['category'], preset['location'], preset['limit'])
                else:
                    print_error("Invalid preset choice")
            except ValueError:
                print_error("Please enter a valid number")
        
        elif choice == '2':
            print_header("CUSTOM TEST")
            category = get_user_input("Event category", "theatre")
            location = get_user_input("Location", "San Francisco, CA")
            try:
                limit = int(get_user_input("Result limit", "10"))
                tester.run_full_comparison(category, location, limit)
            except ValueError:
                print_error("Please enter a valid number for limit")
        
        elif choice == '3':
            print_header("BULK TEST")
            print("Running all preset scenarios...")
            for i, preset in enumerate(presets, 1):
                test_title = f'--- Test {i}/5: {preset["category"].title()} in {preset["location"]} ---'
                print(f"\n{colorize(test_title, Colors.OKCYAN)}")
                tester.run_full_comparison(preset['category'], preset['location'], preset['limit'])
                if i < len(presets):
                    print("\nWaiting 2 seconds before next test...")
                    time.sleep(2)
        
        elif choice == '4':
            if tester.results:
                print_header("PREVIOUS RESULTS SUMMARY")
                for i, test in enumerate(tester.results, 1):
                    print(f"Test {i}: {test['category']} in {test['location']} at {test['timestamp']}")
                    successful_providers = [r['provider'] for r in test['results'] if r['success']]
                    total_events = sum(r['count'] for r in test['results'] if r['success'])
                    print(f"  Successful providers: {', '.join(successful_providers)}")
                    print(f"  Total events found: {total_events}")
                
                # Ask if they want to save results
                save = input("\nSave results to file? (y/n): ").strip().lower()
                if save == 'y':
                    tester.save_results()
            else:
                print_warning("No previous results to show")
        
        elif choice == '5':
            if tester.results:
                save = input("Save results before exiting? (y/n): ").strip().lower()
                if save == 'y':
                    tester.save_results()
            print_success("Thanks for using the Multi-Provider Event Testing Tool!")
            break
        
        else:
            print_error("Invalid choice. Please select 1-5.")
        
        # Ask if they want to continue
        if choice in ['1', '2', '3']:
            continue_choice = input(f"\n{colorize('Press Enter to continue or type \"exit\" to quit: ', Colors.OKBLUE)}").strip().lower()
            if continue_choice == 'exit':
                if tester.results:
                    save = input("Save results before exiting? (y/n): ").strip().lower()
                    if save == 'y':
                        tester.save_results()
                break

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{colorize('Program interrupted by user. Goodbye!', Colors.WARNING)}")
    except Exception as e:
        print_error(f"Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()