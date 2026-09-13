async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const indexHtml = await res.text();
    const links = [...indexHtml.matchAll(/<a href="([^"]+)">.*?<\/a>/g)].map(m => m[1]).filter(l => l.includes('41698/'));
    
    const ch21Url = 'https://www.xbanxia.cc' + links[20];
    console.log('Ch21 URL:', ch21Url);
    
    const chRes = await fetch(ch21Url);
    const chHtml = await chRes.text();
    const text = chHtml.replace(/<[^>]+>/g, '');
    
    const target = '我想知道這些木玄草，是在什麽地方采摘的？';
    const idx = text.indexOf(target);
    if(idx > -1) {
        console.log('--- FOUND TARGET ---');
        console.log(JSON.stringify(text.substring(idx + target.length, idx + target.length + 300)));
    } else {
        console.log('TARGET NOT FOUND');
    }
}
run();
