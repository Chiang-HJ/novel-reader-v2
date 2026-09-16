import urllib.request
import re
url = 'https://apkcombo.com/easy-gps-mock-fake-gps/com.easytoolsstudio.easygpsmock/download/apk'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
match = re.search(r'href=[\"\'|](https://download\.apkcombo\.com/[^\"\']+)[\"\']', html)
if match:
    download_url = match.group(1).replace('&amp;', '&')
    print('Found URL:', download_url)
    req2 = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
    apk_data = urllib.request.urlopen(req2).read()
    open('easy.apk', 'wb').write(apk_data)
    print('APK downloaded! Size:', len(apk_data))
else:
    print('URL not found in HTML')
