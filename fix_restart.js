const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            } else {
                await setupAudio();
                setPlayingState(true);
                if (isSpeechPausedRef.current) {
                    isSpeechPausedRef.current = false;
                } else {
                    playIdRef.current += 1;
                    isSpeechPausedRef.current = false;
                    playFromIndex(currentSentenceIndex, sentencesRef.current, playIdRef.current);
                }
            }`;

const replacement = `            } else {
                // Force-clear the iOS AVSpeechSynthesizer before restarting.
                // If it was interrupted mid-utterance, it can be in a stuck state where
                // new Speech.speak() calls are silently ignored.
                Speech.stop();
                await new Promise(r => setTimeout(r, 150));
                
                await setupAudio();
                setPlayingState(true);
                if (isSpeechPausedRef.current) {
                    isSpeechPausedRef.current = false;
                } else {
                    playIdRef.current += 1;
                    isSpeechPausedRef.current = false;
                    const newPlayId = playIdRef.current;
                    // Small delay to let Speech.stop() fully flush before starting
                    setTimeout(() => {
                        if (newPlayId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(currentSentenceIndex, sentencesRef.current, newPlayId);
                        }
                    }, 100);
                }
            }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
