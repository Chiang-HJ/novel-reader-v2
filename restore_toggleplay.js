const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            if (!text) {
                setIsScraping(false);
                setErrorLog(\`無法解析該章節內容，請稍候重試\`);
                setScrapeUrl(null);
                return;
                }
            }
        } finally {
            isTogglingRef.current = false;
        }
    };

    const startSleepTimer = (minutes) => {`;

const replacement = `            if (!text) {
                setIsScraping(false);
                setErrorLog(\`無法解析該章節內容，請稍候重試\`);
                setScrapeUrl(null);
                return;
            }

            const title = n.chapters[currentIdx].title;
            
            // Save local
            await saveChapterText(n.id, currentIdx, title, text);
            
            setIsScraping(false);
            setScrapeUrl(null);
            applyChapterData({ title, text }, n.id, currentIdx, 0);
        } catch(e) {
            setIsScraping(false);
            setErrorLog(\`處理章節資料錯誤: \${e.message}\`);
            setScrapeUrl(null);
        }
    };

    const togglePlay = async () => {
        if (isTogglingRef.current) return;
        isTogglingRef.current = true;
        try {
            if (isPlayingRef.current) {
                playIdRef.current += 1;
                Speech.stop();
                setPlayingState(false);
            } else {
                // Force-clear iOS AVSpeechSynthesizer before restarting.
                // If interrupted mid-utterance, the synthesizer can be stuck and
                // silently ignore new Speech.speak() calls without firing any callbacks.
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
                    // Extra 100ms to let Speech.stop() fully flush on iOS
                    setTimeout(() => {
                        if (newPlayId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(currentSentenceIndex, sentencesRef.current, newPlayId);
                        }
                    }, 100);
                }
            }
        } finally {
            isTogglingRef.current = false;
        }
    };

    const startSleepTimer = (minutes) => {`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
