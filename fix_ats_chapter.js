const fs = require('fs');
let code = fs.readFileSync('src/context/DownloadContext.js', 'utf8');

const target = `            const ch = selectedSourceChapters[i];
            const chapterUrl = ch.url;`;

const replacement = `            const ch = selectedSourceChapters[i];
            let chapterUrl = ch.url;
            if (chapterUrl && chapterUrl.startsWith('http://')) {
                chapterUrl = chapterUrl.replace('http://', 'https://');
            }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/context/DownloadContext.js', code, 'utf8');
