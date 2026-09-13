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
    const html = await fetchGbk('https://www.xbanxia.cc/books/41698/9825008.html');
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        fs.writeFileSync('ch21_gbk.html', nr1Match[1], 'utf8');
        console.log('Saved ch21_gbk.html');
    }
}
run();
