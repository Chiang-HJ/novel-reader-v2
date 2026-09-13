const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const startSleepTimer = (minutes) => {`;
const replacement = `    const togglePlay = async () => {
        if (isTogglingRef.current) return;
        isTogglingRef.current = true;
        try {
            if (isPlayingRef.current) {
                playIdRef.current += 1;
                Speech.stop();
                setPlayingState(false);
            } else {
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

if (!code.includes('const togglePlay = async () => {')) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
}
