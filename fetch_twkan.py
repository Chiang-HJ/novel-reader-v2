import cloudscraper
import urllib.parse
import sys

def test_twkan(keyword):
    scraper = cloudscraper.create_scraper()
    url = f"https://twkan.com/search.php?searchkey={urllib.parse.quote(keyword)}&searchtype=all"
    print(f"Fetching {url}")
    res = scraper.get(url)
    print("TWKAN HTTP STATUS:", res.status_code)
    
    with open('twkan_search_get.html', 'w', encoding='utf-8') as f:
        f.write(res.text)

if __name__ == "__main__":
    test_twkan("劍來")
