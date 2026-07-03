import fs from 'fs';
import * as twkan from './src/utils/parsers/twkan.js';
import * as czbooks from './src/utils/parsers/czbooks.js';

const html = `
<div class="bookinfo">
    <h4 class="bookname"><a href="/book/123.html">Test Title</a></h4>
    <div class="author">作者：Author</div>
    <img src="/cover.jpg">
</div>
`;

console.log('TWKAN SEARCH:');
console.log(twkan.parseSearchHtml(html));

const infoHtml = `
<meta property="og:novel:book_name" content="My Novel">
<meta property="og:image" content="cover.jpg">
<dd><a href="/book/123/1.html">Chapter 1</a></dd>
`;

console.log('TWKAN INFO:');
console.log(twkan.parseInfo(infoHtml, 'https://twkan.com/book/123.html'));

const czSearchHtml = `
<div class="novel-item-wrapper">
<img src="https://img.czbooks.net/1.jpg">
<div class="novel-item-title"><a href="https://czbooks.net/n/123">Title</a></div>
</div>
`;

console.log('CZ SEARCH:');
console.log(czbooks.parseSearchHtml(czSearchHtml));
