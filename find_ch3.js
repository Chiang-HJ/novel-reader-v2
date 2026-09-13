const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    const uniqueLinks = [...new Set(links)];
    
    for(let i=15; i<=25; i++) {
        const url = 'https://www.xbanxia.cc' + uniqueLinks[i];
        const r = await fetch(url);
        const html = await r.text();
        if (html.includes('实不相瞒') || html.includes('实不相瞒')) {
            console.log('Found in chapter index ' + i + ' url: ' + url);
            const idx = html.indexOf('实不相瞒');
            console.log(html.substring(idx - 20, idx + 200));
        }
    }
}
run();
