const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        let utteranceDone = false;
        Speech.speak(text, {`;

const replacement = `        let utteranceDone = false;
        
        // Watchdog timer to catch iOS TTS silent hangs
        const maxExpectedDurationMs = Math.max(8000, text.length * 400); // 400ms per char max
        const watchdogTimer = setTimeout(() => {
            if (!utteranceDone && playId === playIdRef.current && isPlayingRef.current) {
                console.log('Speech watchdog triggered for text:', text);
                utteranceDone = true;
                Speech.stop();
                playFromIndex(index + 1, sents, playId);
            }
        }, maxExpectedDurationMs);

        Speech.speak(text, {`;

const target2 = `            onDone: () => {
                if (utteranceDone) return;
                utteranceDone = true;`;
const replacement2 = `            onDone: () => {
                if (utteranceDone) return;
                utteranceDone = true;
                clearTimeout(watchdogTimer);`;

const target3 = `            onStopped: () => {
                if (utteranceDone) return;
                utteranceDone = true;`;
const replacement3 = `            onStopped: () => {
                if (utteranceDone) return;
                utteranceDone = true;
                clearTimeout(watchdogTimer);`;

const target4 = `            onError: (error) => {
                if (utteranceDone) return;
                utteranceDone = true;`;
const replacement4 = `            onError: (error) => {
                if (utteranceDone) return;
                utteranceDone = true;
                clearTimeout(watchdogTimer);`;

code = code.replace(target, replacement);
code = code.replace(target2, replacement2);
code = code.replace(target3, replacement3);
code = code.replace(target4, replacement4);

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
