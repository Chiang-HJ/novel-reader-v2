const fs = require('fs');
const html = fs.readFileSync('xbanxia_book.html', 'utf8');

const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
const authorMatch = html.match(/作者：.*?<a[^>]*>(.*?)<\/a>/) || html.match(/作者：([\s\S]*?)<\/p>/);
const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*id="bookimg"/i) || html.match(/<div class="bookimg"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) || html.match(/<div class="pic"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
const descMatch = html.match(/<div[^>]+class="intro"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<p[^>]+class="intro"[^>]*>([\s\S]*?)<\/p>/i) || html.match(/<div class="desc">([\s\S]*?)<\/div>/i);

console.log('Title:', titleMatch ? titleMatch[1].trim() : null);
console.log('Author:', authorMatch ? authorMatch[1].trim() : null);
console.log('Image:', imgMatch ? imgMatch[1].trim() : null);

// chapter links:
const chaptersMatch = html.match(/<div class="dirlist clearfix">[\s\S]*?<\/div>/) || html.match(/<ul class="chapter">[\s\S]*?<\/ul>/) || html.match(/<div class="list[^"]*">([\s\S]*?)<\/div>/i) || html.match(/<ul class="list[^"]*">([\s\S]*?)<\/ul>/i);
if (chaptersMatch) {
    const chLinks = [...chaptersMatch[0].matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
    console.log('Chapters found:', chLinks.length);
    if(chLinks.length > 0) {
        console.log('First chapter:', chLinks[0][1], chLinks[0][2]);
    }
}
