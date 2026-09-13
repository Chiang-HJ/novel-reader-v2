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
    const html = await fetchGbk('https://www.xbanxia.cc/books/41698.html');
    const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
    console.log(titleMatch[1]);
}
run();
