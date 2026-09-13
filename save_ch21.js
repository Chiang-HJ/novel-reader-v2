const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)].map(m => m[1]).filter(l => l.includes('41698/'));
    
    // Chapter 21 (index 20)
    const ch21Url = 'https://www.xbanxia.cc' + links[20];
    const chRes = await fetch(ch21Url);
    const chHtml = await chRes.text();
    
    fs.writeFileSync('ch21.html', chHtml, 'utf8');
    
    const nr1Match = chHtml.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        fs.writeFileSync('ch21_nr1.html', nr1Match[1], 'utf8');
        console.log('Saved to ch21_nr1.html');
    }
}
run();
