const fs = require('fs');
let code = fs.readFileSync('src/utils/parsers/xbanxia.js', 'utf8');
code = code.replace(/http:\/\/www\.xbanxia\.cc/g, 'https://www.xbanxia.cc');
fs.writeFileSync('src/utils/parsers/xbanxia.js', code, 'utf8');
