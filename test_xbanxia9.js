const fs = require('fs');
const html = fs.readFileSync('xbanxia_chapter.html', 'utf8');
const match = html.match(/<div class="page-content[^>]*>([\s\S]*?)<\/div>/i);
if (match) {
    console.log(match[1].substring(0, 1000));
} else {
    console.log("Not found");
}
