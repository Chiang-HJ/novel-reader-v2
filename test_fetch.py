import sys
import codecs
import re
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
from curl_cffi import requests
from bs4 import BeautifulSoup

url = 'https://wyblogs.eu.org/posts/%E5%86%9B%E4%BA%BA%E4%BD%93%E8%82%B2%E7%94%9F%E7%9A%84%E6%80%A7%E5%A5%B4%E5%A4%A7%E5%AD%A6%E7%94%9F%E6%B4%BB/1.html'
try:
    r = requests.get(url, impersonate="chrome110")
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        text = soup.get_text('\n')
        
        print("\n--- MATCHING LINES ---")
        lines = text.split('\n')
        for i, line in enumerate(lines):
            line = line.strip()
            if re.search(r'03[1-9]|0[4-6][0-9]|070', line):
                print(f"Line {i}: {line[:50]}")
    else:
        print(f"Failed: {r.status_code}")
except Exception as e:
    print(f"Error: {e}")
