async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)].map(m => m[1]).filter(l => l.includes('41698/'));
    
    console.log(links.slice(15, 25));
    
    const ch21Url = 'https://www.xbanxia.cc' + links[20];
    const chRes = await fetch(ch21Url);
    const chHtml = await chRes.text();
    
    const nr1Match = chHtml.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        const target = '采摘的？';
        const idx = content.indexOf(target);
        if(idx > -1) {
            console.log('--- FOUND IN RAW HTML ---');
            console.log(content.substring(idx - 10, idx + 200));
        } else {
            console.log('TARGET NOT FOUND IN HTML');
        }
    }
}
run();
