const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        
        if (index >= sents.length) {`;

const replacement = `    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        
        // Await TrackPlayer audio session activation BEFORE speaking, 
        // otherwise activating it asynchronously while speaking causes the TTS to fade out and abort!
        if (isPlayingRef.current) {
            try {
                await TrackPlayer.play();
            } catch(e) {}
        }
        
        if (index >= sents.length) {`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("FAILED");
}
