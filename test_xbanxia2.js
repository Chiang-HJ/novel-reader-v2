const url = 'http://www.xbanxia.cc/books/143300.html';
fetch(url).then(r=>r.text()).then(t => {
    require('fs').writeFileSync('xbanxia_book.html', t, 'utf8');
});
