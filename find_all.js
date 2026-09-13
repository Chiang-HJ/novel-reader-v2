async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    const uniqueLinks = [...new Set(links)];
    
    console.log('Total chapters:', uniqueLinks.length);
    
    // Check first 50 chapters concurrently
    const promises = uniqueLinks.slice(0, 50).map(async (link, idx) => {
        const url = 'https://www.xbanxia.cc' + link;
        try {
            const r = await fetch(url);
            const html = await r.text();
            if (html.includes('木玄草') || html.includes('实不相瞒')) {
                console.log('Found in index', idx, 'url:', url);
                const match = html.match(/[\s\S]{0,50}木玄草[\s\S]{0,100}/);
                if(match) console.log(match[0]);
                const match2 = html.match(/[\s\S]{0,50}实不相瞒[\s\S]{0,100}/);
                if(match2) console.log(match2[0]);
            }
        } catch(e) {}
    });
    await Promise.all(promises);
}
run();
