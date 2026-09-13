const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            onStopped: () => {
                if (utteranceDone) return; // onDone already handled this
                utteranceDone = true;
                // If speech was stopped externally while we think we're playing, stop cleanly
                if (playId === playIdRef.current && isPlayingRef.current) {
                    setPlayingState(false);
                }
            }`;

const replacement = `            onStopped: () => {
                if (utteranceDone) return;
                utteranceDone = true;
                if (playId === playIdRef.current && isPlayingRef.current) {
                    setPlayingState(false);
                }
            },
            onError: (error) => {
                if (utteranceDone) return;
                utteranceDone = true;
                console.log('Speech error:', error, 'on text:', text);
                if (playId === playIdRef.current && isPlayingRef.current) {
                    // Skip the problematic sentence and continue
                    setTimeout(() => {
                        if (playId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(index + 1, sents, playId);
                        }
                    }, 100);
                }
            }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
