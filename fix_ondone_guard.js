const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

// onDone is currently missing the utteranceDone guard - add it
const target = `            onDone: () => {\r\n                if (playId === playIdRef.current && isPlayingRef.current) {`;
const replacement = `            onDone: () => {\r\n                if (utteranceDone) return;\r\n                utteranceDone = true;\r\n                if (playId === playIdRef.current && isPlayingRef.current) {`;
code = code.replace(target, replacement);

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
