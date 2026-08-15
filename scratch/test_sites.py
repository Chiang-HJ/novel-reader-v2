import requests
try:
    r = requests.get('https://twdown.net/', timeout=10)
    print("TWDOWN Status:", r.status_code)
except Exception as e:
    pass

try:
    r = requests.get('https://ssstwitter.com/', timeout=10)
    print("SSS Status:", r.status_code)
except Exception as e:
    pass

try:
    r = requests.get('https://twitsave.com/', timeout=10)
    print("TWITSAVE Status:", r.status_code)
except Exception as e:
    pass
