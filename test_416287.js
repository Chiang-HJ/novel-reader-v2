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
                // xbanxia.cc says charset=gbk in meta, let's try decoding
                resolve(iconv.decode(buffer, 'gbk'));
            });
        }).on('error', reject);
    });
}

async function run() {
    const html = await fetchGbk('https://www.xbanxia.cc/books/416287/72459933.html');
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        const idx = content.indexOf('采摘的');
        if (idx > -1) {
            console.log('--- FOUND ---');
            console.log(content.substring(idx - 50, idx + 100));
        } else {
            console.log('Not found');
        }
    }
}
run();
