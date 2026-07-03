const fs = require('fs');
const html = fs.readFileSync('czbooks_search.html', 'utf8');
const blocks = html.split('novel-item-wrapper').slice(1);
const b = blocks[0];
console.log(b.match(/novel-item-title["'][^>]*>([\s\S]*?)<\/div>/i));
