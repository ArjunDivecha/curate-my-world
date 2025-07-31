import requests
import os

EXA_API_KEY = "2070cfb2-927b-4f3f-a64b-7d0ca3d04e7a"
query = "theatre events in San Francisco Bay Area August 2025"
url = "https://api.exa.ai/search"

headers = {
    "x-api-key": EXA_API_KEY,
    "Content-Type": "application/json"
}

payload = {
    "query": query,
    "type": "auto",
    "numResults": 20,
    "contents": {
        "text": True,
        "summary": {
            "query": "List event name, venue, date, ticket link"
        }
    }
}

def main():
    print(f"Querying Exa: '{query}'")
    res = requests.post(url, headers=headers, json=payload)
    print("Status code:", res.status_code)
    print("Raw response:", res.text[:500])
    if res.status_code == 200:
        data = res.json()
        print("Results:", data.get("results"))
    else:
        print("Error details:", res.text)

if __name__ == "__main__":
    main()