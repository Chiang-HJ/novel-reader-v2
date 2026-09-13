const fs = require('fs');
const http = require('http');
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
    
    // Chapter 21 is index 20
    const url = 'https://www.xbanxia.cc' + uniqueLinks[20];
    const html = await fetchGbk(url);
    
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        
        const target = '木玄草';
        const idx = content.indexOf(target);
        if(idx > -1) {
            console.log('--- FOUND IN RAW HTML ---');
            console.log(content.substring(idx - 50, idx + 300));
        } else {
            console.log('TARGET NOT FOUND IN HTML');
        }
    }
}
run();
