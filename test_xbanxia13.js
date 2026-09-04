const url = 'http://www.xbanxia.cc/books/143300/28251886.html';
fetch(url).then(r=>r.text()).then(html => {
    const nr1 = html.match(/<div id="nr1"[^>]*>([\s\S]*?)<div class="outbt">/i);
    if(nr1) {
        console.log(nr1[1].substring(0, 500));
        console.log("-------");
        console.log(nr1[1].substring(nr1[1].length - 500));
    }
});
