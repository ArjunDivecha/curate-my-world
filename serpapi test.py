import requests
import datetime
import json
import time

SERPAPI_KEY = "830625d9fc12f95fed03eec3005fb7ca414ad548b03b71312f60cd668fc8c42d"
LOCATIONS = [
    "SF Bay Area",
    "Berkeley"
]
QUERIES = [
    "theatre"
]
DAYS_AHEAD = 30

def get_event_results(query, location):
    params = {
        "engine": "google_events",
        "q": f"{query} in {location}",
        "hl": "en",
        "api_key": SERPAPI_KEY
    }
    url = "https://serpapi.com/search"
    print(f"Querying: {params['q']}")
    response = requests.get(url, params=params)
    if response.status_code != 200:
        print(f"Error {response.status_code}: {response.text}")
        return []
    data = response.json()
    return data.get('events_results', [])

def parse_events(events):
    out = []
    for event in events:
        name = event.get('title', '')
        date = event.get('date', {}).get('start_date', '')
        venue = event.get('address', '')
        website = event.get('link', '')
        out.append({
            "concert_name": name,
            "venue": venue,
            "date": date,
            "website": website
        })
    return out

def filter_by_date(events, days_ahead):
    today = datetime.datetime.now()
    future = today + datetime.timedelta(days=days_ahead)
    results = []
    for event in events:
        try:
            if event['date']:
                # Handles "Aug 2", "2025-08-02T20:00:00", etc.
                try:
                    dt = datetime.datetime.fromisoformat(event['date'][:19])
                except:
                    # fallback: try parsing like "Aug 2"
                    dt = datetime.datetime.strptime(event['date'], "%b %d")
                    dt = dt.replace(year=today.year)
                if today <= dt <= future:
                    results.append(event)
        except Exception:
            results.append(event)  # If can't parse, include anyway
    return results

def deduplicate(events):
    seen = set()
    unique = []
    for event in events:
        key = (event["concert_name"], str(event["venue"]), event["date"])
        if key not in seen:
            seen.add(key)
            unique.append(event)
    return unique

def main():
    all_events = []
    for location in LOCATIONS:
        for query in QUERIES:
            events = get_event_results(query, location)
            events_parsed = parse_events(events)
            all_events.extend(events_parsed)
            time.sleep(1)  # avoid rate-limits (SerpAPI limits free tier)
    all_events = filter_by_date(all_events, DAYS_AHEAD)
    all_events = deduplicate(all_events)
    print(json.dumps(all_events, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
