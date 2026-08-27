const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\user\\.gemini\\antigravity\\brain\\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\\scratch\\boylove_chapter.html', 'utf-8');

const scriptMatch = html.match(/function firstMergeImg[\s\S]*?<\/script>/);
if (scriptMatch) {
    console.log("Found script!");
    fs.writeFileSync('C:\\Users\\user\\.gemini\\antigravity\\scratch\\novel-reader-v2\\boylove_script.js', scriptMatch[0]);
} else {
    console.log("Script not found");
}
