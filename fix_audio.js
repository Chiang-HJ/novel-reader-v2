const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const setupAudio = async () => {
        try {
            await Audio.setAudioModeAsync({`;

const replacement = `    const setupAudio = async () => {
        try {
            if (silentSoundRef.current) {
                await silentSoundRef.current.unloadAsync().catch(() => {});
                silentSoundRef.current = null;
            }
            await Audio.setAudioModeAsync({`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
