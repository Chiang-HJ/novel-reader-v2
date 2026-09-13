const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

// 1. Change alwaysPauseOnInterruption to false
code = code.replace('alwaysPauseOnInterruption: true,', 'alwaysPauseOnInterruption: false,');

// 2. Fix the onStopped callback: instead of stopping, try to auto-resume
// Currently: onStopped: () => { if (playId === playIdRef.current && isPlayingRef.current) { setPlayingState(false); } }
// Change to: onStopped — only stop if the stop wasn't triggered by a temporary interruption
// Actually onStopped fires when we call Speech.stop() ourselves, or when iOS interrupts us
// We want to distinguish: if isPlayingRef is true and we didn't call stop ourselves (playId matches), 
// then it was an unwanted interruption — we should auto-retry this sentence
const target = `            onStopped: () => { if (playId === playIdRef.current && isPlayingRef.current) { setPlayingState(false); } },`;
const replacement = `            onStopped: () => {
                // Only retry if playId still matches (not a manual stop) and we think we're playing
                if (playId === playIdRef.current && isPlayingRef.current) {
                    // Brief delay then retry the same sentence
                    setTimeout(() => {
                        if (playId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(index, sents, playId);
                        }
                    }, 300);
                }
            },`;
code = code.replace(target, replacement);

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
