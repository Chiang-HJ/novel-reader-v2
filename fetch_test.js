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
    const html = await fetchGbk('https://www.xbanxia.cc/books/416287/72459933.html');
    fs.writeFileSync('ch_test.html', html, 'utf8');
    
    // Also parse it using our EXACT app parser logic to see the final text output
    let content = '';
    const outbtMatch = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i);
    if (outbtMatch) content = outbtMatch[1];
    
    // Reproduce the parser cleanup:
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<div class="outbt"[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<div[^>]*style="height:\s*0px[^>]*>[\s\S]*?<\/div>/gi, '');
    content = content.replace(/<span[^>]*半夏小說[^<]*<\/span>/gi, '');
    
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<\/p>/gi, '\n');
    content = content.replace(/<\/div>/gi, '\n');
    content = content.replace(/<[^>]+>/g, '');
    
    content = content.replace(/&nbsp;/gi, ' ');
    content = content.replace(/&lt;/gi, '<');
    content = content.replace(/&gt;/gi, '>');
    content = content.replace(/&amp;/gi, '&');
    content = content.replace(/&quot;/gi, '"');
    content = content.replace(/&#39;/gi, "'");
    content = content.replace(/&apos;/gi, "'");
    content = content.replace(/[\r\n]+/g, '\n').trim();
    
    fs.writeFileSync('ch_test_parsed.txt', content, 'utf8');
    
    console.log('Saved ch_test.html and ch_test_parsed.txt');
}
run();
