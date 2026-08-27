const fs = require('fs');
const html = fs.readFileSync('chapter.html', 'utf16le');

const images = [];
const regex = /<img.*?data-original="([^"]+)".*?>/g;
let match;
while ((match = regex.exec(html)) !== null) {
    let imgUrl = match[1].trim();
    if (!imgUrl.startsWith('http')) {
        imgUrl = 'https://img.boylove.cc' + imgUrl;
    }
    images.push(imgUrl);
}

if (images.length === 0) {
    const imgRegex = /https:\/\/img\.boylove\.cc\/[a-zA-Z0-9_/\.\-]+\.(jpg|jpeg|png|webp)/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
        if (imgMatch[0].includes('/bookimages/')) {
            images.push(imgMatch[0]);
        }
    }
}
console.log('Images length:', images.length);
if (images.length > 0) {
    console.log(images[0]);
} else {
    const m = html.match(/<img/g);
    console.log("img tags found:", m ? m.length : 0);
    // Find script tags
    const s = html.match(/<script/g);
    console.log("script tags found:", s ? s.length : 0);
    // maybe write the html back as utf8
    fs.writeFileSync('chapter_utf8.html', html, 'utf8');
}
