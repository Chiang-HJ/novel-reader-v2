const fs = require('fs');
const {parseSearchHtml} = require('./src/utils/parsers/czbooks.js');
const html = fs.readFileSync('czbooks_search.html', 'utf8');

const blocks = html.split('novel-item-wrapper').slice(1);
console.log('Blocks found:', blocks.length);
if(blocks.length > 0) {
    const b = blocks[0];
    const urlMatch = b.match(/href\s*=\s*["']([^"']*czbooks\.net\/n\/[^"']*)["']/i);
    console.log('urlMatch:', urlMatch ? urlMatch[1] : null);
    
    const titleMatch = b.match(/novel-item-title["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    console.log('titleMatch:', titleMatch ? titleMatch[1] : null);
}
