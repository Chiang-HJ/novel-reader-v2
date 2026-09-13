async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    // regex can still match ascii characters
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a[^>]*href=["']([^"'>]+)["']/gi)]
        .map(m => m[1])
        .filter(l => l.includes('41698/'));
    const uniqueLinks = [...new Set(links)];
    
    // Chapter 21 is index 20
    const url = 'https://www.xbanxia.cc' + uniqueLinks[20];
    const r = await fetch(url);
    const html = await r.text();
    
    const nr1Match = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i) || html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i);
    if(nr1Match) {
        let content = nr1Match[1];
        
        // Find all script tags in the content
        const scripts = content.match(/<script[\s\S]*?<\/script>/gi);
        if (scripts) {
            console.log('Found scripts in chapter 21:', scripts.length);
            console.log(scripts);
        } else {
            console.log('No scripts found in chapter 21 nr1');
        }
        
        // Check for any literal '</script>'
        const allEndScripts = content.match(/<\/script>/gi);
        if (allEndScripts) {
            console.log('Total </script> occurrences:', allEndScripts.length);
        }
    }
}
run();
