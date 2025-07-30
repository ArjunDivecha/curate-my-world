#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: multi-provider-tester.py
=============================================================================

DESCRIPTION:
Interactive Python program to test various prompts with all three event providers:
- Perplexity AI (via our Node.js API)
- Apyflux API (via our Node.js API)  
- PredictHQ API (direct Python integration)

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
- Requires Node.js API server running on localhost:3001
- PredictHQ API key included for direct testing
- Results saved to outputs/ directory
=============================================================================
"""

import requests
import json
import sys
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

# Configuration
CONFIG = {
    'API_BASE_URL': 'http://127.0.0.1:3001/api',
    'PREDICTHQ_API_KEY': '8K2-8oWxCmuJ09HuFBwafivPpoK3Dqmab0qpmEkR',
    'PREDICTHQ_BASE_URL': 'https://api.predicthq.com/v1',
    'DEFAULT_LIMIT': 10,
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
    
    def test_perplexity(self, category: str, location: str, limit: int = 10) -> Dict[str, Any]:
        """Test Perplexity API via our Node.js endpoint"""
        try:
            print_section("Testing Perplexity AI")
            start_time = time.time()
            
            url = f"{CONFIG['API_BASE_URL']}/events/{category}"
            params = {
                'location': location,
                'limit': limit
            }
            
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            
            # Use a fresh session for each request to avoid connection pooling issues
            session = requests.Session()
            response = session.get(url, params=params, timeout=CONFIG['TIMEOUT'])
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
                            print(f"     Confidence: {event.get('confidence', 'N/A')}")
                    
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
    
    def test_apyflux(self, category: str, location: str, limit: int = 10) -> Dict[str, Any]:
        """Test Apyflux API via direct Node.js client call"""
        try:
            print_section("Testing Apyflux API")
            start_time = time.time()
            
            # Use our combined endpoint to get Apyflux results
            url = f"{CONFIG['API_BASE_URL']}/events/{category}/compare"
            params = {
                'location': location,
                'limit': limit
            }
            
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            
            # Use a fresh session for each request to avoid connection pooling issues
            session = requests.Session()
            response = session.get(url, params=params, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                apyflux_data = data.get('comparison', {}).get('apyflux', {})
                
                if apyflux_data.get('success'):
                    count = apyflux_data.get('count', 0)
                    print_success(f"Found {count} events in {duration:.0f}ms")
                    
                    # Show sample events
                    events = apyflux_data.get('events', [])
                    if events:
                        print("\nSample Events:")
                        for i, event in enumerate(events[:3]):
                            print(f"  {i+1}. {event.get('title', event.get('name', 'Untitled'))}")
                            print(f"     Venue: {event.get('venue', event.get('venueInfo', {}).get('name', 'Unknown'))}")
                            print(f"     Date: {event.get('dateHuman', event.get('startDate', 'TBD'))}")
                            print(f"     Tickets: {len(event.get('ticketLinks', []))} sources")
                    
                    return {
                        'provider': 'apyflux',
                        'success': True,
                        'count': count,
                        'events': events,
                        'duration_ms': duration,
                        'processing_time': apyflux_data.get('processingTime', 'N/A')
                    }
                else:
                    print_error(f"API Error: {apyflux_data.get('error', 'Unknown error')}")
                    return {
                        'provider': 'apyflux',
                        'success': False,
                        'error': apyflux_data.get('error', 'Unknown error'),
                        'count': 0,
                        'events': [],
                        'duration_ms': duration
                    }
            else:
                print_error(f"HTTP {response.status_code}: {response.text}")
                return {
                    'provider': 'apyflux',
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
                
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'apyflux',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def test_predicthq(self, category: str, location: str, limit: int = 10) -> Dict[str, Any]:
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
            # Remove location qualifiers and use just the city name
            location_query = location.split(',')[0].strip()
            
            # Try different location formats for better compatibility
            url = f"{CONFIG['PREDICTHQ_BASE_URL']}/events"
            params = {
                'category': phq_category,
                'q': location_query,  # Use general query instead of place.scope
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
    
    def test_combined(self, category: str, location: str, limit: int = 10) -> Dict[str, Any]:
        """Test combined API with deduplication"""
        try:
            print_section("Testing Combined API (Perplexity + Apyflux)")
            start_time = time.time()
            
            url = f"{CONFIG['API_BASE_URL']}/events/{category}/combined"
            params = {
                'location': location,
                'limit': limit
            }
            
            print_info(f"URL: {url}")
            print_info(f"Params: {params}")
            
            # Use a fresh session for each request to avoid connection pooling issues
            session = requests.Session()
            response = session.get(url, params=params, timeout=CONFIG['TIMEOUT'])
            duration = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    count = data.get('count', 0)
                    dedup = data.get('deduplication', {})
                    sources = data.get('sources', {})
                    
                    print_success(f"Found {count} unique events in {duration:.0f}ms")
                    print_info(f"Deduplication: {dedup.get('duplicatesRemoved', 0)} duplicates removed from {dedup.get('totalProcessed', 0)} total")
                    print_info(f"Sources: Perplexity ({sources.get('perplexity', {}).get('count', 0)}), Apyflux ({sources.get('apyflux', {}).get('count', 0)})")
                    
                    # Show sample events
                    events = data.get('events', [])
                    if events:
                        print("\nSample Deduplicated Events:")
                        for i, event in enumerate(events[:3]):
                            print(f"  {i+1}. {event.get('title', 'Untitled')}")
                            print(f"     Venue: {event.get('venue', 'Unknown')}")
                            print(f"     Date: {event.get('dateHuman', event.get('startDate', 'TBD'))}")
                            print(f"     Source: {event.get('source', 'unknown')}")
                            if event.get('_duplicateCount', 1) > 1:
                                print(f"     🔗 Merged from {event.get('_duplicateCount')} sources")
                    
                    return {
                        'provider': 'combined',
                        'success': True,
                        'count': count,
                        'events': events,
                        'duration_ms': duration,
                        'deduplication': dedup,
                        'sources': sources
                    }
                else:
                    print_error(f"API Error: {data.get('error', 'Unknown error')}")
                    return {
                        'provider': 'combined',
                        'success': False,
                        'error': data.get('error', 'Unknown error'),
                        'count': 0,
                        'events': [],
                        'duration_ms': duration
                    }
            else:
                print_error(f"HTTP {response.status_code}: {response.text}")
                return {
                    'provider': 'combined',
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'count': 0,
                    'events': [],
                    'duration_ms': duration
                }
                
        except Exception as e:
            print_error(f"Exception: {str(e)}")
            return {
                'provider': 'combined',
                'success': False,
                'error': str(e),
                'count': 0,
                'events': [],
                'duration_ms': 0
            }
    
    def run_full_comparison(self, category: str, location: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Run comparison across all providers"""
        print_header(f"TESTING ALL PROVIDERS")
        print_info(f"Category: {category}")
        print_info(f"Location: {location}")
        print_info(f"Limit: {limit}")
        
        results = []
        
        # Test each provider
        results.append(self.test_perplexity(category, location, limit))
        results.append(self.test_apyflux(category, location, limit))
        results.append(self.test_predicthq(category, location, limit))
        results.append(self.test_combined(category, location, limit))
        
        # Generate summary
        self.print_comparison_summary(results, category, location, limit)
        
        # Store results
        self.results.append({
            'timestamp': datetime.now().isoformat(),
            'category': category,
            'location': location,
            'limit': limit,
            'results': results
        })
        
        return results
    
    def print_comparison_summary(self, results: List[Dict[str, Any]], category: str, location: str, limit: int):
        """Print a formatted comparison summary"""
        print_header("COMPARISON SUMMARY")
        
        # Create summary table
        table_data = []
        for result in results:
            status = "✅ OK" if result['success'] else "❌ FAIL"
            count = result['count']
            duration = f"{result['duration_ms']:.0f}ms"
            notes = ""
            
            if result['provider'] == 'combined' and result.get('deduplication'):
                notes = f"{result['deduplication'].get('duplicatesRemoved', 0)} dupes removed"
            elif result['provider'] == 'predicthq' and result.get('total_available'):
                notes = f"{result['total_available']} total available"
            elif not result['success']:
                notes = result.get('error', 'Unknown error')[:30]
            
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

def main():
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