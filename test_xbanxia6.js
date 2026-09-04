const fs = require('fs');
const html = fs.readFileSync('xbanxia_book.html', 'utf8');
const bookStart = html.indexOf('<p>最近更新');
console.log(html.substring(bookStart !== -1 ? bookStart : 2000, (bookStart !== -1 ? bookStart : 2000) + 2000));
