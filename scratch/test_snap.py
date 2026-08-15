import requests
try:
    r = requests.get('https://snapany.com/zh-Hant/twitter', timeout=10)
    print(r.status_code)
    print(r.text[:500])
except Exception as e:
    print("Error:", e)
