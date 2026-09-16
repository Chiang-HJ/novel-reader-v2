const fs = require('fs');
const iconv = require('iconv-lite');

fetch('https://www.xbanxia.cc/books/416287/72459933.html')
  .then(r => r.arrayBuffer())
  .then(buf => {
    const str = iconv.decode(Buffer.from(buf), 'gbk');
    const match = str.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i);
    if(match) {
        console.log(match[1].slice(0, 500));
    } else {
        console.log('No match for outbt, trying extractById');
    }
  });
