async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/416287/72459933.html');
    const html = await res.text();
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        const idx = content.indexOf('采摘的');
        if (idx > -1) {
            console.log('--- FOUND UTF8 ---');
            console.log(content.substring(idx - 50, idx + 100));
        } else {
            console.log('Not found UTF8');
        }
        
        // Find </script> literally
        const sIdx = content.indexOf('</script>');
        if (sIdx > -1) {
            console.log('--- FOUND </script> in nr1 ---');
            console.log(content.substring(sIdx - 50, sIdx + 100));
        }
    }
}
run();
