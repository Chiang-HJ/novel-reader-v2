const fs = require('fs');

fetch('https://www.xbanxia.cc/books/416287/72459933.html')
  .then(r => r.text())
  .then(str => {
    const match = str.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i);
    if(match) {
        let content = match[1];
        console.log(content.slice(0, 1000));
        
        // Let's also look for any weird entities
        const entities = content.match(/&[a-zA-Z0-9#]+;/g);
        if (entities) {
            console.log('Entities found:', [...new Set(entities)]);
        }
    } else {
        console.log('No match for outbt');
    }
  });
