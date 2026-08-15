import requests
from bs4 import BeautifulSoup

try:
    r = requests.get('https://snapany.com/zh-Hant/twitter', timeout=10)
    soup = BeautifulSoup(r.text, 'html.parser')
    
    inputs = soup.find_all('input')
    for i in inputs:
        print("Input:", i.attrs)
        
    buttons = soup.find_all('button')
    for b in buttons:
        print("Button:", b.attrs, b.text)
        
except Exception as e:
    print("Error:", e)
