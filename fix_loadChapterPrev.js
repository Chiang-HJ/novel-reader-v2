const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target1 = `loadChapter(n, chapterIndexRef.current - 1, 0);`;
const replacement1 = `loadChapter(n, chapterIndexRef.current - 1, -1);`;

code = code.split(target1).join(replacement1);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
console.log("SUCCESS");
