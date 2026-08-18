const fs = require('fs');
const path = require('path');

const srcDir = 'c:/Users/user/.gemini/antigravity/scratch/novel-reader-v2/src';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.js')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(srcDir);
files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        if (line.includes('from ') && line.includes('utils/storage')) {
            console.log(`${path.basename(file)}:${i+1}: ${line.trim()}`);
        }
        if (line.includes('from ') && line.includes('utils/comicUtils')) {
            console.log(`${path.basename(file)}:${i+1}: ${line.trim()}`);
        }
    });
});
