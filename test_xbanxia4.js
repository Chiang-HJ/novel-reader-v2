const fs = require('fs');
const html = fs.readFileSync('xbanxia_book.html', 'utf8');
console.log(html.substring(0, 2000));
