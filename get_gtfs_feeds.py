import requests
import os

# Replace this with your actual refresh token
REFRESH_TOKEN = "AMf-vBwT3o81SBdD-qHZIHPZjt93aEId40r_JvBBtNG9RwXFFch3pdsc1wUX_nQzj8aiPUSVqkY4znHdVmUwNEoJGETfIt07Va69QoanIdgr2LtJviqSkK7YlAeQwuDW0wPMhHU9dWdCvs7Aqb4nN5xCHTWndS55Hz8NPUuEcW9apfnFj5eQcLj_oxdY0cxZe_kFzE7Jk6pby39hqdhA_PuHAgrUOFedOM9tSTL852BskjFXgXGKOYM"
TOKEN_URL = "https://api.mobilitydatabase.org/v1/tokens"
FEEDS_URL = "https://api.mobilitydatabase.org/v1/search"

def get_access_token(refresh_token):
    headers = {"Content-Type": "application/json"}
    payload = {"refresh_token": refresh_token}
    response = requests.post(TOKEN_URL, json=payload, headers=headers)
    response.raise_for_status()
    return response.json().get("access_token")

def get_feeds(access_token, limit=2000, offset=0):
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    params = {
        "limit": limit,
        "offset": offset,
        "data_type": "gtfs",
        "search_query": "MTA"
    }
    response = requests.get(FEEDS_URL, headers=headers, params=params)
    response.raise_for_status()
    return response.json().get("results")

def download_gtfs_feeds(feed_urls, output_dir="gtfs_feeds"):
    os.makedirs(output_dir, exist_ok=True)
    for url in feed_urls:
        try:
            filename = url.split("/")[-1]
            print(f"Downloading {filename}...")
            response = requests.get(url)
            response.raise_for_status()
            with open(os.path.join(output_dir, filename), "wb") as f:
                f.write(response.content)
        except Exception as e:
            print(f"Failed to download {url}: {e}")

# Run the process
try:
    token = get_access_token(REFRESH_TOKEN)
    feeds = get_feeds(token)

    # Extract GTFS feed URLs
    feed_urls = []
    for feed in feeds:
        dataset = feed.get("latest_dataset")
        if dataset and "hosted_url" in dataset:
            feed_urls.append(dataset["hosted_url"])

    print(f"Found {len(feed_urls)} GTFS feeds to download.")
    download_gtfs_feeds(feed_urls)

except Exception as e:
    print(f"Error: {e}")

