const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        const playFromIndex = (index, sents, playId) => {
            if (playId !== playIdRef.current) return;
            if (!sents || sents.length === 0) return;`;

const replacement = `        const playFromIndex = async (index, sents, playId) => {
            if (playId !== playIdRef.current) return;
            if (!sents || sents.length === 0) return;
            
            // Await TrackPlayer audio session activation BEFORE speaking, 
            // otherwise activating it asynchronously while speaking causes the TTS to fade out and abort!
            if (!isPlayingRef.current) {
                try {
                    await TrackPlayer.play();
                } catch(e) {}
            }`;

code = code.replace(target, replacement);

const target2 = `        const togglePlay = useCallback(async () => {
        if (isPlayingRef.current) {
            isPlayingRef.current = false;
            setPlayingState(false);
            Speech.stop();
        } else {
            if (sentencesRef.current.length === 0) {
                loadChapter(novelRef.current || novel, chapterIndexRef.current);
                return;
            }
            isPlayingRef.current = true;
            isSpeechPausedRef.current = false;
            const currentPlayId = playIdRef.current;
            setTimeout(() => playFromIndex(currentSentenceIndex, sentencesRef.current, currentPlayId), 100);
        }
    }, [currentSentenceIndex, loadChapter, novel]);`;

const replacement2 = `        const togglePlay = useCallback(async () => {
        if (isPlayingRef.current) {
            isPlayingRef.current = false;
            setPlayingState(false);
            Speech.stop();
        } else {
            if (sentencesRef.current.length === 0) {
                loadChapter(novelRef.current || novel, chapterIndexRef.current);
                return;
            }
            isPlayingRef.current = true;
            setPlayingState(true); // Update UI immediately
            isSpeechPausedRef.current = false;
            const currentPlayId = playIdRef.current;
            setTimeout(() => playFromIndex(currentSentenceIndex, sentencesRef.current, currentPlayId), 100);
        }
    }, [currentSentenceIndex, loadChapter, novel]);`;

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
