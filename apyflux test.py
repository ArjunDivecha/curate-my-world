import requests

url = 'https://gateway.apyflux.com/v1/search-events?query=Concerts in San-Francisco&date=any&is_virtual=false&start=0'
headers = {
    'x-app-id': '928a8cb5-a978-455b-a65e-8b23f2f1ff82',
    'x-client-id': 'S0OCG4fOhxUy6WNFwgBiVi7yV8K2',
    'x-api-key': 'Zt53NYzQr5woo9X+d2G0wLABitCxebOTOTUCBvgCWYU='
}

response = requests.get(url, headers=headers, timeout=10)
print(response.text)