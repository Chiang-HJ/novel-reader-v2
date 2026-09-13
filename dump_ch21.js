const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    const uniqueLinks = [...new Set(links)];
    
    console.log('Chapter 21 URL:', 'https://www.xbanxia.cc' + uniqueLinks[20]);
    console.log('Chapter 22 URL:', 'https://www.xbanxia.cc' + uniqueLinks[21]);
    
    // Fetch chapter 21 and dump some text
    const r = await fetch('https://www.xbanxia.cc' + uniqueLinks[20]);
    const html = await r.text();
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        // print first 500 characters
        console.log(content.substring(0, 500));
        fs.writeFileSync('ch21_content.html', content, 'utf8');
    }
}
run();
