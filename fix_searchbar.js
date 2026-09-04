const fs = require('fs');
let code = fs.readFileSync('src/components/home/SearchBar.js', 'utf8');

code = code.replace(/placeholder="[^"]+"/, 'placeholder="搜尋書名或貼上網址下載..."');
code = code.replace(/>貼[^<]+</, '>貼上網址<');
code = code.replace(/>貼[^<]+</, '>貼上內文<');
code = code.replace(/>[^<]+入檔[^<]*</, '>匯入檔案<');

fs.writeFileSync('src/components/home/SearchBar.js', code, 'utf8');
