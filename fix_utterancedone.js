const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

// The replacement target to add utteranceDone flag right before Speech.speak
const target = `        Speech.speak(text, {`;
const replacement = `        let utteranceDone = false;
        Speech.speak(text, {`;

// Only do it once (first occurrence = the main one in playFromIndex)
const idx = code.indexOf(target);
code = code.substring(0, idx) + replacement + code.substring(idx + target.length);

// Also update onDone to set utteranceDone
const targetOnDone = `            onDone: () => {
                if (utteranceDone) return;
                utteranceDone = true;`;
if (!code.includes('utteranceDone = true;')) {
    // Add utteranceDone = true inside onDone
    code = code.replace(
        `            onDone: () => {\r\n                if (playId === playIdRef.current && isPlayingRef.current) {`,
        `            onDone: () => {\r\n                if (utteranceDone) return;\r\n                utteranceDone = true;\r\n                if (playId === playIdRef.current && isPlayingRef.current) {`
    );
}

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
