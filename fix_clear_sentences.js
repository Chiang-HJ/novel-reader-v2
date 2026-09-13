const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            setChapterData(null);
            setChapterIndex(idx);`;

const replacement = `            setChapterData(null);
            sentencesRef.current = [];
            setSentences([]);
            setChapterIndex(idx);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
