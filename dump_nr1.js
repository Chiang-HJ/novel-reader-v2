const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698/9825008.html');
    const html = await res.text();
    const idx = html.indexOf('id="nr1"');
    console.log(html.substring(idx - 20, idx + 800));
}
run();
