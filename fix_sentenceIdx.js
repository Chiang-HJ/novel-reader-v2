const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            sentencesRef.current = newSents;
            setSentences(newSents);
            setCurrentSentenceIndex(sentenceIdx);
            
            updateReadingProgress(nid, idx, sentenceIdx);
            
            if (isPlayingRef.current) {
                playIdRef.current += 1;
                const currentPlayId = playIdRef.current;
                setTimeout(() => playFromIndex(0, newSents, currentPlayId), 500);
            }
            
            // If paging mode is active, tell WebView to highlight the first sentence
            if (isPagingModeRef.current && pagingWebViewRef.current) {
                pagingWebViewRef.current.injectJavaScript(\`
                    highlightSentence(\${sentenceIdx});
                    true;
                \`);
            }`;

const replacement = `            sentencesRef.current = newSents;
            setSentences(newSents);
            
            let finalSentenceIdx = sentenceIdx;
            if (finalSentenceIdx < 0) {
                finalSentenceIdx = Math.max(0, newSents.length - 1);
            }
            
            setCurrentSentenceIndex(finalSentenceIdx);
            
            updateReadingProgress(nid, idx, finalSentenceIdx);
            
            if (isPlayingRef.current) {
                playIdRef.current += 1;
                const currentPlayId = playIdRef.current;
                setTimeout(() => playFromIndex(finalSentenceIdx, newSents, currentPlayId), 500);
            }
            
            // If paging mode is active, tell WebView to highlight the target sentence
            if (isPagingModeRef.current && pagingWebViewRef.current) {
                pagingWebViewRef.current.injectJavaScript(\`
                    highlightSentence(\${finalSentenceIdx});
                    true;
                \`);
            }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
console.log("SUCCESS applyChapterData");
