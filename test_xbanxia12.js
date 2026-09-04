const url = 'http://www.xbanxia.cc/books/143300/28251886.html';
fetch(url).then(r=>r.text()).then(html => {
    const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if(article) {
        const divs = article[1].match(/<div[^>]*>/gi);
        console.log(divs);
        const text = article[1].replace(/<[^>]+>/g, '').trim().substring(0, 300);
        console.log("Raw text:", text);
    }
});
