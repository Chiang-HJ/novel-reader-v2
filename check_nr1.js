const fs = require('fs');
const html = fs.readFileSync('ch_test.html', 'utf8');

const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i);
if (nr1Match) {
    const nr1 = nr1Match[1];
    let startIdx = 0;
    while(true) {
        let idx = nr1.indexOf('</script>', startIdx);
        if (idx === -1) {
            if (startIdx === 0) console.log('No </script> found inside nr1!');
            break;
        }
        console.log('\n--- Match at ' + idx + ' ---');
        console.log(nr1.substring(Math.max(0, idx - 100), Math.min(nr1.length, idx + 100)));
        startIdx = idx + 9;
    }
}
