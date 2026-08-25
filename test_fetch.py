import sys, codecs, re
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
from curl_cffi import requests
from bs4 import BeautifulSoup

# Try fetching page 2
url2 = 'https://wyblogs.eu.org/posts/%E5%86%9B%E4%BA%BA%E4%BD%93%E8%82%B2%E7%94%9F%E7%9A%84%E6%80%A7%E5%A5%B4%E5%A4%A7%E5%AD%A6%E7%94%9F%E6%B4%BB/2.html'
r2 = requests.get(url2, impersonate='chrome110')
print(f"Page 2 status: {r2.status_code}")
if r2.status_code == 200:
    soup = BeautifulSoup(r2.text, 'html.parser')
    text = soup.get_text('\n')
    # Print first 2000 chars
    print("First 2000 chars of page 2:")
    print(text[:2000])
