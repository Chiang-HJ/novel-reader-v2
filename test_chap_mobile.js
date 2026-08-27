const fs = require('fs');
const html = fs.readFileSync('chapter_mobile.html', 'utf16le');
const m = html.match(/<img/g);
console.log("img tags found in mobile chapter:", m ? m.length : 0);
const imgRegex = /https:\/\/img\.boylove\.cc\/[a-zA-Z0-9_/\.\-]+\.(jpg|jpeg|png|webp)/g;
let match;
let i = 0;
while ((match = imgRegex.exec(html)) !== null) {
    if (match[0].includes('/bookimages/')) i++;
}
console.log("Image urls found:", i);
