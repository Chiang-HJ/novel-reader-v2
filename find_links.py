import re
html = open('apkcombo.html', encoding='utf-8').read()
links = re.findall(r'href=[\"\'](https://[^\"\']+\.apk[^\"\']*)[\"\']', html)
print(links)
