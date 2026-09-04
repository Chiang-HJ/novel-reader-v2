const url = 'http://www.xbanxia.cc/books/143300/28251886.html';
fetch(url).then(r=>r.text()).then(html => {
    const match = html.match(/<div class="page-content[^>]*>([\s\S]*?)<\/div>/i);
    if (match) {
        console.log(match[1].substring(0, 1000));
    } else {
        console.log("Not found in page-content");
        const match2 = html.match(/<div id="content"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (match2) console.log("Found in content or article", match2[1].substring(0, 500));
    }
});
