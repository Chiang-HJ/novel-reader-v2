const url = 'http://www.xbanxia.cc/books/143300/28251886.html';
fetch(url).then(r=>r.text()).then(html => {
    const contentMatch = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div id="content"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch) {
        console.log(contentMatch[1].substring(0, 500));
    }
});
