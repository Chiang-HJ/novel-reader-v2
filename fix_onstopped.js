const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            onStopped: () => {
                if (utteranceDone) return;
                utteranceDone = true;
                clearTimeout(watchdogTimer);
                if (playId === playIdRef.current && isPlayingRef.current) {
                    setPlayingState(false);
                }
            },`;

const replacement = `            onStopped: () => {
                if (utteranceDone) return;
                utteranceDone = true;
                clearTimeout(watchdogTimer);
                if (playId === playIdRef.current && isPlayingRef.current) {
                    // If we are still supposed to be playing, but the engine stopped unexpectedly
                    // (e.g. iOS TTS aborted due to invalid text or interruption),
                    // we should NOT pause the app. We should skip to the next sentence!
                    console.log('Speech stopped unexpectedly. Skipping to next sentence.');
                    setTimeout(() => {
                        if (playId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(index + 1, sents, playId);
                        }
                    }, 100);
                }
            },`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
