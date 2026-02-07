"""
=============================================================================
SCRIPT NAME: discover_venues.py
=============================================================================

INPUT FILES:
- None (generates data from AI APIs)

OUTPUT FILES:
- data/venue-registry.json: Comprehensive venue database
- data/venue-registry.xlsx: Excel version for manual review
- logs/venue-discovery.log: Processing log

VERSION: 1.0
LAST UPDATED: 2026-01-17
AUTHOR: Claude Code

DESCRIPTION:
AI-powered venue discovery script that uses Claude and Perplexity to build
a comprehensive registry of Bay Area event venues with addresses, calendar
URLs, and geographic coordinates.

DEPENDENCIES:
- anthropic
- requests
- pandas
- openpyxl

USAGE:
python scripts/venue-discovery/discover_venues.py

=============================================================================
"""

import os
import sys
import json
import time
import logging
import hashlib
from datetime import datetime
from pathlib import Path

# MUST load credentials BEFORE importing anthropic
sys.path.insert(0, '/Users/arjundivecha/python_utils')
try:
    from onepassword_credentials import load_credentials
    load_credentials(['Anthropic'])
    print("✅ Loaded Anthropic credentials from 1Password")
except ImportError:
    print("Warning: 1Password credentials not available, checking env vars")
    if not os.environ.get('ANTHROPIC_API_KEY'):
        # Try loading from .env.txt
        env_file = Path('/Users/arjundivecha/Dropbox/AAA Backup/.env.txt')
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith('ANTHROPIC_API_KEY='):
                    os.environ['ANTHROPIC_API_KEY'] = line.split('=', 1)[1].strip()
                    print("✅ Loaded ANTHROPIC_API_KEY from .env.txt")
                    break

# Now import anthropic after credentials are set
import anthropic
import requests
import pandas as pd

# =============================================================================
# CONFIGURATION
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = PROJECT_ROOT / "logs"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / 'venue-discovery.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Bay Area regions for comprehensive coverage
BAY_AREA_REGIONS = [
    "San Francisco",
    "Oakland",
    "Berkeley",
    "San Jose",
    "Palo Alto",
    "Mountain View",
    "Walnut Creek",
    "San Rafael",
    "Santa Rosa",
    "Napa"
]

# Categories to discover
VENUE_CATEGORIES = [
    {
        "name": "music",
        "subcategories": ["concert halls", "live music clubs", "jazz venues", "rock venues", "classical music", "outdoor amphitheaters"],
        "keywords": ["live music", "concerts", "shows", "performances"]
    },
    {
        "name": "theatre",
        "subcategories": ["theaters", "playhouses", "performing arts centers", "opera houses", "dance venues"],
        "keywords": ["plays", "musicals", "dance", "opera", "ballet"]
    },
    {
        "name": "comedy",
        "subcategories": ["comedy clubs", "improv theaters", "stand-up venues"],
        "keywords": ["stand-up", "improv", "comedy shows"]
    },
    {
        "name": "art",
        "subcategories": ["museums", "galleries", "art centers", "cultural centers"],
        "keywords": ["exhibitions", "art shows", "installations"]
    },
    {
        "name": "lectures",
        "subcategories": ["lecture halls", "cultural institutions", "libraries", "bookstores with events"],
        "keywords": ["talks", "lectures", "author events", "discussions"]
    },
    {
        "name": "movies",
        "subcategories": ["independent cinemas", "film centers", "repertory theaters", "drive-ins"],
        "keywords": ["film screenings", "movie premieres", "film festivals"]
    },
    {
        "name": "food",
        "subcategories": ["food halls", "festival venues", "culinary centers", "wineries with events"],
        "keywords": ["food festivals", "wine tastings", "culinary events"]
    },
    {
        "name": "tech",
        "subcategories": ["conference centers", "coworking spaces with events", "university venues"],
        "keywords": ["meetups", "tech talks", "conferences", "hackathons"]
    }
]

# =============================================================================
# CLAUDE API CLIENT
# =============================================================================

class VenueDiscoveryAgent:
    """Uses Claude to discover and enrich venue data."""

    def __init__(self):
        self.client = anthropic.Anthropic()
        self.model = "claude-sonnet-4-20250514"
        self.all_venues = []
        self.seen_venues = set()  # For deduplication

    def _generate_venue_id(self, name, city):
        """Generate unique venue ID from name and city."""
        key = f"{name.lower()}|{city.lower()}"
        return hashlib.md5(key.encode()).hexdigest()[:12]

    def _is_duplicate(self, name, city):
        """Check if venue already discovered."""
        key = f"{name.lower().strip()}|{city.lower().strip()}"
        if key in self.seen_venues:
            return True
        self.seen_venues.add(key)
        return False

    def discover_venues_for_category(self, category, region="San Francisco Bay Area"):
        """Discover all venues for a category using Claude."""

        logger.info(f"Discovering {category['name']} venues in {region}...")

        prompt = f"""You are a local events expert for the {region}. I need a comprehensive list of {category['name']} venues.

TASK: List ALL {category['name']} venues in the {region} where people can attend events.

Include these types of venues:
{', '.join(category['subcategories'])}

For EACH venue, provide this exact JSON structure:
{{
    "name": "Venue Name",
    "address": "Full street address",
    "city": "City name",
    "state": "CA",
    "website": "https://venue-website.com",
    "calendar_url": "URL to their events/calendar page (if different from main site)",
    "category": "{category['name']}",
    "subcategory": "specific type (e.g., jazz club, art museum)",
    "capacity": "small/medium/large",
    "description": "Brief 1-sentence description"
}}

IMPORTANT:
- Include BOTH major well-known venues AND smaller local spots
- Only include venues that regularly host public events
- Include the calendar/events URL if you know it (often /events, /calendar, /shows, /whats-on)
- Be thorough - aim for 30-50 venues minimum for this category
- Cover San Francisco, Oakland, Berkeley, San Jose, and surrounding Bay Area cities

Return ONLY a JSON array of venues, no other text."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8000,
                messages=[{"role": "user", "content": prompt}]
            )

            content = response.content[0].text

            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            venues = json.loads(content)

            # Process and deduplicate
            new_venues = 0
            for venue in venues:
                if not self._is_duplicate(venue.get('name', ''), venue.get('city', '')):
                    venue['id'] = self._generate_venue_id(venue['name'], venue['city'])
                    venue['discovered_at'] = datetime.now().isoformat()
                    venue['source'] = 'claude_discovery'
                    self.all_venues.append(venue)
                    new_venues += 1

            logger.info(f"  Found {len(venues)} venues, {new_venues} new (after dedup)")
            return venues

        except json.JSONDecodeError as e:
            logger.error(f"  Failed to parse JSON response: {e}")
            logger.debug(f"  Raw response: {content[:500]}...")
            return []
        except Exception as e:
            logger.error(f"  Error discovering venues: {e}")
            return []

    def enrich_venue_with_calendar(self, venue):
        """Use Claude to find the calendar URL for a venue."""

        if venue.get('calendar_url') and venue['calendar_url'] != venue.get('website'):
            return venue  # Already has calendar URL

        prompt = f"""For the venue "{venue['name']}" located at {venue.get('address', venue.get('city', 'Bay Area'))}:

Website: {venue.get('website', 'unknown')}

Find their events/calendar page URL. Common patterns:
- /events
- /calendar
- /shows
- /whats-on
- /performances
- /schedule

Also determine the calendar format:
- "ical" if they have a .ics feed
- "eventbrite" if events are on Eventbrite
- "html" if it's a standard web calendar
- "api" if they have a ticketing system like AXS, Ticketmaster embed

Return JSON:
{{
    "calendar_url": "full URL to calendar page",
    "calendar_type": "ical|eventbrite|html|api",
    "has_rss": true/false,
    "ticketing_platform": "platform name if known (ticketmaster, eventbrite, axs, etc.)"
}}

If you can't determine the calendar URL, use the website URL."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )

            content = response.content[0].text
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            enrichment = json.loads(content)
            venue.update(enrichment)
            return venue

        except Exception as e:
            logger.warning(f"  Could not enrich {venue['name']}: {e}")
            return venue

    def discover_all_categories(self):
        """Run discovery for all categories."""

        logger.info("=" * 60)
        logger.info("STARTING AI VENUE DISCOVERY")
        logger.info("=" * 60)

        for category in VENUE_CATEGORIES:
            self.discover_venues_for_category(category)
            time.sleep(2)  # Rate limiting

        logger.info(f"\nTotal unique venues discovered: {len(self.all_venues)}")
        return self.all_venues

    def enrich_all_venues(self, limit=None):
        """Enrich venues with calendar URLs (optional, costs more API calls)."""

        venues_to_enrich = self.all_venues[:limit] if limit else self.all_venues

        logger.info(f"\nEnriching {len(venues_to_enrich)} venues with calendar URLs...")

        for i, venue in enumerate(venues_to_enrich):
            if i % 10 == 0:
                logger.info(f"  Progress: {i}/{len(venues_to_enrich)}")

            self.enrich_venue_with_calendar(venue)
            time.sleep(0.5)  # Rate limiting

        return self.all_venues


# =============================================================================
# GEOCODING
# =============================================================================

class Geocoder:
    """Geocode venue addresses using free Nominatim API."""

    def __init__(self):
        self.base_url = "https://nominatim.openstreetmap.org/search"
        self.cache = {}
        self.headers = {
            "User-Agent": "SquirtleVenueDiscovery/1.0 (event-curation-project)"
        }

    def geocode(self, address, city, state="CA"):
        """Get coordinates for an address."""

        full_address = f"{address}, {city}, {state}"

        if full_address in self.cache:
            return self.cache[full_address]

        try:
            params = {
                "q": full_address,
                "format": "json",
                "limit": 1
            }

            response = requests.get(
                self.base_url,
                params=params,
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                results = response.json()
                if results:
                    coords = {
                        "lat": float(results[0]["lat"]),
                        "lng": float(results[0]["lon"])
                    }
                    self.cache[full_address] = coords
                    return coords

            # Fallback: try just city
            params["q"] = f"{city}, {state}"
            response = requests.get(
                self.base_url,
                params=params,
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                results = response.json()
                if results:
                    coords = {
                        "lat": float(results[0]["lat"]),
                        "lng": float(results[0]["lon"]),
                        "geocode_quality": "city_level"
                    }
                    self.cache[full_address] = coords
                    return coords

        except Exception as e:
            logger.warning(f"Geocoding failed for {full_address}: {e}")

        return None

    def geocode_venues(self, venues):
        """Add coordinates to all venues."""

        logger.info(f"\nGeocoding {len(venues)} venues...")

        for i, venue in enumerate(venues):
            if i % 20 == 0:
                logger.info(f"  Progress: {i}/{len(venues)}")

            coords = self.geocode(
                venue.get('address', ''),
                venue.get('city', 'San Francisco'),
                venue.get('state', 'CA')
            )

            if coords:
                venue['coordinates'] = coords

            time.sleep(1.1)  # Nominatim rate limit: 1 request/second

        # Count success rate
        geocoded = sum(1 for v in venues if v.get('coordinates'))
        if len(venues) > 0:
            logger.info(f"  Geocoded {geocoded}/{len(venues)} venues ({100*geocoded/len(venues):.1f}%)")
        else:
            logger.info("  No venues to geocode")

        return venues


# =============================================================================
# CALENDAR URL VALIDATOR
# =============================================================================

def validate_url(url):
    """Check if a URL is reachable."""
    try:
        response = requests.head(url, timeout=5, allow_redirects=True)
        return response.status_code < 400
    except:
        return False

def detect_calendar_patterns(website_url):
    """Try common calendar URL patterns."""

    if not website_url:
        return None

    patterns = [
        "/events",
        "/calendar",
        "/shows",
        "/schedule",
        "/whats-on",
        "/performances",
        "/upcoming",
        "/tickets"
    ]

    base = website_url.rstrip('/')

    for pattern in patterns:
        test_url = base + pattern
        if validate_url(test_url):
            return test_url

    return None


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def load_existing_whitelist():
    """Load existing whitelist venues to merge."""

    whitelist_path = DATA_DIR / "whitelist.xlsx"

    if whitelist_path.exists():
        try:
            df = pd.read_excel(whitelist_path)
            logger.info(f"Loaded {len(df)} existing whitelist venues")
            return df.to_dict('records')
        except Exception as e:
            logger.warning(f"Could not load existing whitelist: {e}")

    return []

def merge_with_existing(discovered_venues, existing_venues):
    """Merge discovered venues with existing whitelist."""

    # Create lookup for existing venues
    existing_lookup = {}
    for v in existing_venues:
        key = v.get('domain', '') or v.get('name', '')
        if key:
            existing_lookup[key.lower()] = v

    # Merge - prefer discovered data but keep existing URLs
    merged = []
    seen_domains = set()
    seen_names = set()

    # First, add all discovered venues
    for venue in discovered_venues:
        domain = venue.get('website', '').replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0]

        if domain and domain.lower() in existing_lookup:
            # Merge with existing
            existing = existing_lookup[domain.lower()]
            venue['domain'] = existing.get('domain', domain)
            if not venue.get('calendar_url'):
                venue['calendar_url'] = existing.get('calendar_url')
        else:
            venue['domain'] = domain

        name_key = venue.get('name', '').lower().strip()
        if name_key and name_key not in seen_names:
            seen_names.add(name_key)
            if domain:
                seen_domains.add(domain.lower())
            merged.append(venue)

    # Then add existing venues not already in merged list
    for v in existing_venues:
        domain = v.get('domain', '')
        name = v.get('name', '')

        if domain and domain.lower() not in seen_domains:
            if name and name.lower().strip() not in seen_names:
                # Convert existing whitelist format to new format
                merged.append({
                    'name': name,
                    'domain': domain,
                    'category': v.get('category', 'general'),
                    'city': v.get('city', 'San Francisco'),
                    'state': 'CA',
                    'website': f"https://{domain}",
                    'calendar_url': f"https://{domain}/events",
                    'source': 'existing_whitelist'
                })
                seen_domains.add(domain.lower())
                seen_names.add(name.lower().strip())

    logger.info(f"Merged: {len(discovered_venues)} discovered + {len(existing_venues)} existing = {len(merged)} unique")
    return merged

def save_results(venues):
    """Save venues to JSON and Excel."""

    # Save JSON
    json_path = DATA_DIR / "venue-registry.json"
    with open(json_path, 'w') as f:
        json.dump(venues, f, indent=2, default=str)
    logger.info(f"Saved {len(venues)} venues to {json_path}")

    # Save Excel
    xlsx_path = DATA_DIR / "venue-registry.xlsx"
    df = pd.DataFrame(venues)

    # Flatten coordinates for Excel
    if 'coordinates' in df.columns:
        df['lat'] = df['coordinates'].apply(lambda x: x.get('lat') if isinstance(x, dict) else None)
        df['lng'] = df['coordinates'].apply(lambda x: x.get('lng') if isinstance(x, dict) else None)
        df = df.drop(columns=['coordinates'])

    df.to_excel(xlsx_path, index=False)
    logger.info(f"Saved Excel to {xlsx_path}")

    # Print summary by category
    logger.info("\n" + "=" * 60)
    logger.info("VENUE DISCOVERY SUMMARY")
    logger.info("=" * 60)

    if 'category' in df.columns:
        summary = df.groupby('category').size().sort_values(ascending=False)
        for cat, count in summary.items():
            logger.info(f"  {cat}: {count} venues")

    logger.info(f"\nTotal venues: {len(venues)}")

    geocoded = df['lat'].notna().sum() if 'lat' in df.columns else 0
    logger.info(f"With coordinates: {geocoded}")

    with_calendar = df['calendar_url'].notna().sum() if 'calendar_url' in df.columns else 0
    logger.info(f"With calendar URL: {with_calendar}")


def main():
    """Main execution flow."""

    logger.info("=" * 60)
    logger.info("SQUIRTLE VENUE DISCOVERY")
    logger.info(f"Started: {datetime.now().isoformat()}")
    logger.info("=" * 60)

    # Step 1: Discover venues with Claude
    agent = VenueDiscoveryAgent()
    discovered = agent.discover_all_categories()

    # Step 2: Load and merge with existing whitelist
    existing = load_existing_whitelist()
    venues = merge_with_existing(discovered, existing)

    # Step 3: Geocode venues
    geocoder = Geocoder()
    venues = geocoder.geocode_venues(venues)

    # Step 4: Save results
    save_results(venues)

    logger.info("\n" + "=" * 60)
    logger.info("DISCOVERY COMPLETE")
    logger.info("=" * 60)

    return venues


if __name__ == "__main__":
    main()
