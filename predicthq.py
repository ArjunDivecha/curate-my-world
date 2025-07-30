import requests

response = requests.get(
  url="https://api.predicthq.com/v1/events",
  headers={
    "Authorization": "Bearer 8K2-8oWxCmuJ09HuFBwafivPpoK3Dqmab0qpmEkR",
    "Accept": "application/json"
  }
)

print(response.json())