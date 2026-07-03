import cloudscraper
import urllib.parse
import sys

def test_czbooks(keyword):
    scraper = cloudscraper.create_scraper()
    url = f"https://czbooks.net/s/{urllib.parse.quote(keyword)}"
    print(f"Fetching {url}")
    res = scraper.get(url)
    print("CZBOOKS HTTP STATUS:", res.status_code)
    
    with open('czbooks_search.html', 'w', encoding='utf-8') as f:
        f.write(res.text)

def test_twkan(keyword):
    scraper = cloudscraper.create_scraper()
    url = "https://twkan.com/search.php"
    print(f"Fetching {url}")
    res = scraper.post(url, data={"searchkey": keyword, "searchtype": "all"})
    print("TWKAN HTTP STATUS:", res.status_code)
    
    with open('twkan_search.html', 'w', encoding='utf-8') as f:
        f.write(res.text)

if __name__ == "__main__":
    test_czbooks("劍來")
    test_twkan("劍來")
