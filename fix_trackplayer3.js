const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const targetStr = "if (playId !== playIdRef.current) return;";
const insertIdx = code.indexOf(targetStr) + targetStr.length;

const newCode = code.slice(0, insertIdx) + `
        
        // Await TrackPlayer audio session activation BEFORE speaking, 
        // otherwise activating it asynchronously while speaking causes the TTS to fade out and abort!
        if (isPlayingRef.current) {
            try {
                await TrackPlayer.play();
            } catch(e) {}
        }
` + code.slice(insertIdx);

fs.writeFileSync('src/screens/ReaderScreen.js', newCode, 'utf8');
console.log("SUCCESS");
