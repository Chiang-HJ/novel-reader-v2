const fs = require('fs');
const html = fs.readFileSync('xbanxia_book.html', 'utf8');

const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
const authorMatch = html.match(/作者︰.*?<a[^>]*>(.*?)<\/a>/);
const imgMatch = html.match(/<div class="book-img"[^>]*>[\s\S]*?<img[^>]+data-original="([^"]+)"/i) || html.match(/<div class="book-img"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
const descMatch = html.match(/<div class="describe-html"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);

console.log('Title:', titleMatch ? titleMatch[1].trim() : null);
console.log('Author:', authorMatch ? authorMatch[1].trim() : null);
console.log('Image:', imgMatch ? imgMatch[1].trim() : null);
console.log('Desc length:', descMatch ? descMatch[1].length : 0);

const chaptersMatch = html.match(/<div class="book-list[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
if (chaptersMatch) {
    const chLinks = [...chaptersMatch[1].matchAll(/<li><a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a><\/li>/g)];
    console.log('Chapters found:', chLinks.length);
    if(chLinks.length > 0) {
        console.log('First chapter:', chLinks[0][1], chLinks[0][2]);
    }
}
