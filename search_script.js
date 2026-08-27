const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\user\\.gemini\\antigravity\\brain\\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\\scratch\\boylove_chapter_utf8.html', 'utf8');
const match = content.match(/do_mergeImg[\s\S]*?\}/);
if (match) {
    console.log(match[0]);
} else {
    console.log("Not found");
}
