const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

// 1. Add sentencesRef alongside sentences state
const target1 = `    const [sentences, setSentences] = useState([]);`;
const replacement1 = `    const [sentences, setSentences] = useState([]);
    const sentencesRef = useRef([]);`;
code = code.replace(target1, replacement1);

// 2. Keep sentencesRef in sync whenever setSentences is called
// There's only one setSentences call in applyChapterData
const target2 = `            setSentences(newSents);`;
const replacement2 = `            sentencesRef.current = newSents;
            setSentences(newSents);`;
code = code.replace(target2, replacement2);

// 3. Use sentencesRef.current instead of sentences in togglePlay (stale closure fix)
const target3 = `                    playFromIndex(currentSentenceIndex, sentences, playIdRef.current);`;
const replacement3 = `                    playFromIndex(currentSentenceIndex, sentencesRef.current, playIdRef.current);`;
code = code.replace(target3, replacement3);

// 4. Fix all other direct 'sentences' references in playFromIndex calls 
//    (anywhere sentences state is passed rather than sents parameter)
// Line ~656, 798, 809, 1283, 1401, 1493, 1860
code = code.replace(/playFromIndex\(currentSentenceIndex, sentences,/g, 'playFromIndex(currentSentenceIndex, sentencesRef.current,');
code = code.replace(/playFromIndex\(data\.index, sentences,/g, 'playFromIndex(data.index, sentencesRef.current,');
code = code.replace(/playFromIndex\(i, sentences,/g, 'playFromIndex(i, sentencesRef.current,');
code = code.replace(/playFromIndex\(idx, sentences,/g, 'playFromIndex(idx, sentencesRef.current,');

// 5. Fix the onStopped race condition: use a per-utterance done flag
const target5 = `        Speech.speak(text, {
            language: 'zh-TW',
            voice: selectedVoice || undefined,
            rate,
            pitch,
            onDone: () => {`;
const replacement5 = `        let utteranceDone = false;
        Speech.speak(text, {
            language: 'zh-TW',
            voice: selectedVoice || undefined,
            rate,
            pitch,
            onDone: () => {
                if (utteranceDone) return;
                utteranceDone = true;`;
code = code.replace(target5, replacement5);

// 6. Fix onStopped to also use utteranceDone flag
const target6 = `            onStopped: () => {
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
const replacement6 = `            onStopped: () => {
                if (utteranceDone) return; // onDone already handled this
                utteranceDone = true;
                // If speech was stopped externally while we think we're playing, stop cleanly
                if (playId === playIdRef.current && isPlayingRef.current) {
                    setPlayingState(false);
                }
            },`;
code = code.replace(target6, replacement6);

fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
