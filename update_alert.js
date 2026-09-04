const fs = require('fs');
let code = fs.readFileSync('src/screens/HomeScreen.js', 'utf8');
code = code.replace('目前支援狂人小說與微風小說網址。(例如 czbooks, wyblogs 等)', '目前支援半夏小說、狂人小說與微風小說網址。(例如 xbanxia, czbooks, wyblogs 等)');
fs.writeFileSync('src/screens/HomeScreen.js', code, 'utf8');
