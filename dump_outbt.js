const fs = require('fs');
async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698/9825008.html');
    const html = await res.text();
    const idx = html.indexOf('class="outbt"');
    if (idx > -1) {
        console.log('outbt found at', idx);
        console.log(html.substring(idx - 50, idx + 50));
    } else {
        console.log('outbt NOT found!');
    }
}
run();
