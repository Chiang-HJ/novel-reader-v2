const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    
    // Find unique links
    const uniqueLinks = [...new Set(links)];
    
    // Let's just fetch chapter 20, 21, 22
    for(let i=19; i<=22; i++) {
        const url = 'https://www.xbanxia.cc' + uniqueLinks[i];
        const r = await fetch(url);
        const html = await r.text();
        if (html.includes('木玄草')) {
            console.log('Found in chapter index ' + i + ' URL: ' + url);
            const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
            if(nr1Match) {
                const content = nr1Match[1];
                const idx = content.indexOf('木玄草');
                console.log(content.substring(idx - 50, idx + 200));
            }
        }
    }
}
run();
