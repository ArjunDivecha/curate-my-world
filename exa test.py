#!/usr/bin/env python3

import os
import datetime
from exa_py import Exa

def main():
    api_key = os.getenv("EXA_API_KEY")
    if not api_key:
        raise RuntimeError("Please set the EXA_API_KEY environment variable")
    exa = Exa(api_key=api_key)

    today = datetime.date.today()
    end = today + datetime.timedelta(days=30)

    query = (
        "theatre events greater San Francisco Bay Area "
        f"from {today.isoformat()} to {end.isoformat()}"
    )
    resp = exa.search(
        query,
        num_results=100,
        start_published_date=today.isoformat(),
        end_published_date=end.isoformat(),
        type="auto"
    )

    print(f"Query: {query}")
    print(f"Retrieved {len(resp.results)} results")
    print("-" * 60)

    events = []
    theatre_keywords = ["theatre", "play", "musical", "opera", "shakespeare", 
                        "production", "repertory", "shakes", "stage", "festival"]

    for r in resp.results:
        title = (r.title or "").lower()
        snippet = (getattr(r, "snippet", "") or "").lower()
        url = r.url or ""
        pub = getattr(r, "published_date", "unknown")

        text = title + " " + snippet
        if any(tok in text for tok in theatre_keywords):
            events.append((r.title or "<no title>", url, pub))

    if not events:
        print("No theatre events found in the next 30 days in Greater SF Bay Area.")
    else:
        print(f"Found {len(events)} likely theatre events:")
        for idx, (t, u, p) in enumerate(events, start=1):
            print(f"{idx}. {t}\n    → {u}\n    (Published: {p})\n")

if __name__ == "__main__":
    main()