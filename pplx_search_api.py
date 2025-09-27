#!/usr/bin/env python3
"""
Test program: query the NEW Perplexity Search API (September 2025) for music events in SF Bay,
using the dedicated /search endpoint instead of chat completions.
Measures requests, speed, latency, and cost.
"""

import os
import time
import json
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

def install_instructions():
    print("For the NEW Perplexity Search API (September 2025):")
    print("    pip install requests")
    print("And set your API key:")
    print("    export PERPLEXITY_API_KEY=\"your_api_key_here\"")
    print("\nPricing: $5 per 1,000 requests (no token fees)")

def query_music_events_search_api() -> tuple[Dict[str, Any], str, float]:
    """Use the new dedicated Search API endpoint"""
    # Get API key from environment
    api_key = os.environ.get("PERPLEXITY_API_KEY") or os.environ.get("PPLX_API_KEY")
    if not api_key:
        raise ValueError("PERPLEXITY_API_KEY environment variable not set")

    # API configuration
    url = "https://api.perplexity.ai/search"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Build query: today to ~30 days ahead
    today = datetime.today()
    next_month = today + timedelta(days=30)
    query_text = (
        f"music events concerts San Francisco Bay Area "
        f"{today.strftime('%B %d, %Y')} to {next_month.strftime('%B %d, %Y')} "
        f"venues dates tickets Eventbrite Ticketmaster"
    )

    # Prepare search request payload
    payload = {
        "query": query_text,
        "max_results": 20,           # Get more results for events
        "max_tokens_per_page": 2048, # More content per page
        "country": "US"              # Geographic filter
    }

    # Execute the search and measure time
    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    elapsed = time.time() - start

    if not response.ok:
        raise RuntimeError(f"Search API error {response.status_code}: {response.text}")

    return response.json(), query_text, elapsed

def query_music_events_multi_search() -> tuple[Dict[str, Any], List[str], float]:
    """Use multi-query search (up to 5 queries per request)"""
    # Get API key from environment
    api_key = os.environ.get("PERPLEXITY_API_KEY") or os.environ.get("PPLX_API_KEY")
    if not api_key:
        raise ValueError("PERPLEXITY_API_KEY environment variable not set")

    # API configuration
    url = "https://api.perplexity.ai/search"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Build multiple queries for comprehensive coverage
    today = datetime.today()
    next_month = today + timedelta(days=30)
    date_range = f"{today.strftime('%B %d, %Y')} to {next_month.strftime('%B %d, %Y')}"

    queries = [
        f"concerts music events San Francisco {date_range} venues tickets",
        f"Oakland Berkeley music shows {date_range} Eventbrite",
        f"San Jose South Bay concerts {date_range} live music",
        f"festivals music Bay Area {date_range} outdoor events",
        f"comedy shows theater San Francisco {date_range} entertainment"
    ]

    # Prepare multi-search request payload
    payload = {
        "query": queries,            # Array of queries
        "max_results": 15,           # Results per query
        "max_tokens_per_page": 1536,
        "country": "US"
    }

    # Execute the search and measure time
    start = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=45)
    elapsed = time.time() - start

    if not response.ok:
        raise RuntimeError(f"Multi-search API error {response.status_code}: {response.text}")

    return response.json(), queries, elapsed

def analyze_search_results(results: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze the search results and extract event information"""
    analysis = {
        "total_results": 0,
        "sources": set(),
        "domains": set(),
        "recent_updates": 0,
        "events_found": []
    }

    # Handle both single and multi-query responses
    if isinstance(results.get("results"), list):
        # Single query response
        search_results = results["results"]
        analysis["total_results"] = len(search_results)

        for result in search_results:
            # Extract source information
            url = result.get("url", "")
            if url:
                domain = url.split("//")[-1].split("/")[0]
                analysis["domains"].add(domain)

            # Check for recent updates (within last 30 days)
            last_updated = result.get("last_updated", "")
            if last_updated:
                try:
                    update_date = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                    if (datetime.now(update_date.tzinfo) - update_date).days <= 30:
                        analysis["recent_updates"] += 1
                except:
                    pass

            # Look for event indicators in title/snippet
            title = result.get("title", "").lower()
            snippet = result.get("snippet", "").lower()
            event_keywords = ["concert", "show", "event", "festival", "tour", "live", "tickets"]

            if any(keyword in title or keyword in snippet for keyword in event_keywords):
                analysis["events_found"].append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("snippet", "")[:200] + "..." if len(result.get("snippet", "")) > 200 else result.get("snippet", ""),
                    "date": result.get("date", ""),
                    "last_updated": last_updated
                })

    # Convert sets to lists for JSON serialization
    analysis["sources"] = list(analysis["sources"])
    analysis["domains"] = list(analysis["domains"])

    return analysis

def main():
    install_instructions()
    print("\n" + "="*60)
    print("TESTING NEW PERPLEXITY SEARCH API (September 2025)")
    print("="*60)

    try:
        # Test 1: Single search query
        print("\n1. Testing single search query...")
        response, query_text, latency = query_music_events_search_api()

        print(f"Query: {query_text}")
        print(f"Latency: {latency:.3f} seconds")

        # Analyze results
        analysis = analyze_search_results(response)

        print(f"\n🎵 Search Results Summary:")
        print(f"  Total results: {analysis['total_results']}")
        print(f"  Domains found: {len(analysis['domains'])}")
        print(f"  Recent updates: {analysis['recent_updates']}")
        print(f"  Potential events: {len(analysis['events_found'])}")

        if analysis['domains']:
            print(f"  Top domains: {', '.join(list(analysis['domains'])[:5])}")

        # Show first few events found
        if analysis['events_found']:
            print(f"\n🎤 Sample Events Found:")
            for i, event in enumerate(analysis['events_found'][:3], 1):
                print(f"  {i}. {event['title']}")
                print(f"     URL: {event['url']}")
                print(f"     Snippet: {event['snippet']}")
                print()

        # Cost calculation (Search API: $5 per 1,000 requests)
        request_cost = 5.0 / 1000  # $0.005 per request
        print(f"\n💰 Cost Analysis:")
        print(f"  Requests made: 1")
        print(f"  Cost per request: ${request_cost:.6f}")
        print(f"  Total cost: ${request_cost:.6f}")
        print(f"  Speed: {analysis['total_results']/latency:.1f} results/sec")

        # Test 2: Multi-query search
        print(f"\n" + "-"*60)
        print("2. Testing multi-query search...")

        multi_response, queries, multi_latency = query_music_events_multi_search()

        print(f"Queries ({len(queries)}):")
        for i, q in enumerate(queries, 1):
            print(f"  {i}. {q}")

        print(f"Multi-search latency: {multi_latency:.3f} seconds")

        # Analyze multi-search results
        multi_analysis = analyze_search_results(multi_response)
        multi_request_cost = 5.0 / 1000  # Still one request for multi-query

        print(f"\n🎵 Multi-Search Results Summary:")
        print(f"  Total results: {multi_analysis['total_results']}")
        print(f"  Unique domains: {len(multi_analysis['domains'])}")
        print(f"  Recent updates: {multi_analysis['recent_updates']}")
        print(f"  Potential events: {len(multi_analysis['events_found'])}")
        print(f"  Cost: ${multi_request_cost:.6f}")
        print(f"  Efficiency: {multi_analysis['total_results']/multi_latency:.1f} results/sec")

        # Save detailed results to JSON
        output_data = {
            "timestamp": datetime.now().isoformat(),
            "single_search": {
                "query": query_text,
                "latency": latency,
                "analysis": analysis,
                "cost": request_cost
            },
            "multi_search": {
                "queries": queries,
                "latency": multi_latency,
                "analysis": multi_analysis,
                "cost": multi_request_cost
            },
            "raw_responses": {
                "single": response,
                "multi": multi_response
            }
        }

        with open("search_api_results.json", "w") as f:
            json.dump(output_data, f, indent=2, default=str)

        print(f"\n📁 Detailed results saved to: search_api_results.json")

    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nMake sure you have:")
        print("1. Set PERPLEXITY_API_KEY environment variable")
        print("2. Installed requests: pip install requests")
        print("3. Valid API access to the new Search API")

if __name__ == "__main__":
    main()