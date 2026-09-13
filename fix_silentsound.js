const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const targetStr = "await TrackPlayer.play();";
const insertIdx = code.indexOf(targetStr) + targetStr.length;

const newCode = code.slice(0, insertIdx) + `
                if (silentSoundRef.current) {
                    await silentSoundRef.current.playAsync();
                }
` + code.slice(insertIdx);

fs.writeFileSync('src/screens/ReaderScreen.js', newCode, 'utf8');
console.log("SUCCESS");
