const fs = require('fs');
let code = fs.readFileSync('src/components/home/SearchBar.js', 'utf8');

code = code.replace(/placeholder="[^"]+"/, 'placeholder="輸入小說網址..."');

// Fix buttons
code = code.replace(/<Text[^>]*>貼[^<]+<\/Text>/, '<Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>貼上網址</Text>');
code = code.replace(/<Text[^>]*>貼[^<]+<\/Text>/, '<Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>手動貼上</Text>');
code = code.replace(/<Text[^>]*>[^<]*入檔[^<]*<\/Text>/, '<Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>匯入檔案</Text>');

fs.writeFileSync('src/components/home/SearchBar.js', code, 'utf8');
