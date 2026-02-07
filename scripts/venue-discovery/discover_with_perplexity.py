"""
=============================================================================
SCRIPT NAME: discover_with_perplexity.py
=============================================================================

Uses Perplexity API (via backend .env) to discover Bay Area venues.

=============================================================================
"""

import os
import sys
import json
import time
import logging
import hashlib
import requests
from datetime import datetime
from pathlib import Path
# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
BACKEND_ENV = PROJECT_ROOT / "curate-events-api" / ".env"
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = PROJECT_ROOT / "logs"

# Load backend .env manually (avoid dotenv dependency)
def load_env_file(filepath):
    """Load .env file without external dependencies."""
    if filepath.exists():
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")

load_env_file(BACKEND_ENV)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / 'venue-discovery-perplexity.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

PERPLEXITY_API_KEY = os.environ.get('PERPLEXITY_API_KEY')
if not PERPLEXITY_API_KEY:
    logger.error("PERPLEXITY_API_KEY not found in backend .env")
    sys.exit(1)

logger.info(f"Loaded Perplexity API key: {PERPLEXITY_API_KEY[:10]}...")

# Categories to discover
CATEGORIES = [
    ("music", "live music venues, concert halls, clubs"),
    ("theatre", "theaters, performing arts centers, playhouses"),
    ("comedy", "comedy clubs, improv theaters"),
    ("art", "art museums, galleries, cultural centers"),
    ("movies", "independent cinemas, film centers, repertory theaters"),
    ("lectures", "lecture halls, bookstores with events, libraries"),
    ("food", "food halls, festival venues, wineries with events"),
    ("tech", "conference centers, coworking spaces with events")
]

def query_perplexity(prompt):
    """Query Perplexity API."""

    url = "https://api.perplexity.ai/chat/completions"
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "sonar-pro",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_tokens": 8000,
        "temperature": 0.1
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if not response.ok:
            logger.error(f"Perplexity API error {response.status_code}: {response.text[:500]}")
            return None
        data = response.json()
        content = data['choices'][0]['message']['content']
        return content
    except Exception as e:
        logger.error(f"Perplexity API error: {e}")
        return None

def parse_json_response(content):
    """Extract JSON array from response."""
    if not content:
        return []

    # Try to extract JSON from markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]

    # Clean up common issues
    content = content.strip()
    if not content.startswith('['):
        # Try to find JSON array in content
        start = content.find('[')
        end = content.rfind(']') + 1
        if start >= 0 and end > start:
            content = content[start:end]

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")
        logger.debug(f"Raw content: {content[:500]}...")
        return []

def discover_venues_for_category(category_name, category_desc):
    """Discover venues for a category using Perplexity."""

    logger.info(f"Discovering {category_name} venues...")

    prompt = f"""List all {category_desc} in the San Francisco Bay Area where people can attend events.

For each venue, provide ONLY this JSON structure:
{{
    "name": "Venue Name",
    "address": "Street address",
    "city": "City",
    "website": "https://example.com",
    "category": "{category_name}"
}}

Include:
- Major well-known venues
- Smaller local spots
- Venues in SF, Oakland, Berkeley, San Jose, Palo Alto, and surrounding areas

Return ONLY a JSON array with 30-50 venues. No explanations."""

    content = query_perplexity(prompt)
    venues = parse_json_response(content)

    # Add metadata
    for v in venues:
        v['discovered_at'] = datetime.now().isoformat()
        v['source'] = 'perplexity_discovery'
        v['state'] = 'CA'

    logger.info(f"  Found {len(venues)} {category_name} venues")
    return venues

def main():
    """Run discovery for all categories."""

    logger.info("=" * 60)
    logger.info("PERPLEXITY VENUE DISCOVERY")
    logger.info("=" * 60)

    all_venues = []
    seen_names = set()

    for cat_name, cat_desc in CATEGORIES:
        venues = discover_venues_for_category(cat_name, cat_desc)

        for v in venues:
            name_key = v.get('name', '').lower().strip()
            if name_key and name_key not in seen_names:
                seen_names.add(name_key)
                all_venues.append(v)

        time.sleep(2)  # Rate limiting

    # Load and merge with existing registry
    existing_path = DATA_DIR / "venue-registry.json"
    if existing_path.exists():
        with open(existing_path) as f:
            existing = json.load(f)
        logger.info(f"Loaded {len(existing)} existing venues")

        # Add existing venues not in new list
        for v in existing:
            name_key = v.get('name', '').lower().strip()
            if name_key and name_key not in seen_names:
                seen_names.add(name_key)
                all_venues.append(v)

    # Save merged results
    output_path = DATA_DIR / "venue-registry.json"
    with open(output_path, 'w') as f:
        json.dump(all_venues, f, indent=2, default=str)

    logger.info(f"\nTotal unique venues: {len(all_venues)}")
    logger.info(f"Saved to: {output_path}")

    # Summary by category
    from collections import Counter
    cats = Counter(v.get('category', 'unknown') for v in all_venues)
    for cat, count in cats.most_common():
        logger.info(f"  {cat}: {count}")

if __name__ == "__main__":
    main()
