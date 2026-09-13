const fs = require('fs');
const https = require('https');
const iconv = require('iconv-lite');

async function fetchGbk(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(iconv.decode(buffer, 'gbk'));
            });
        }).on('error', reject);
    });
}

async function run() {
    const indexHtml = await fetchGbk('https://www.xbanxia.cc/books/41698.html');
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    const uniqueLinks = [...new Set(links)];
    
    console.log('Searching', uniqueLinks.length, 'chapters...');
    const promises = uniqueLinks.map(async (link, idx) => {
        const url = 'https://www.xbanxia.cc' + link;
        try {
            const html = await fetchGbk(url);
            if (html.includes('木玄草') || html.includes('实不相瞒')) {
                console.log('Found in index', idx, 'url:', url);
                const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
                if (nr1Match) {
                    const content = nr1Match[1];
                    const i = content.indexOf('木玄草') > -1 ? content.indexOf('木玄草') : content.indexOf('实不相瞒');
                    console.log('Text:', content.substring(i - 20, i + 200).replace(/\n/g, ' '));
                }
            }
        } catch(e) {}
    });
    await Promise.all(promises);
}
run();
