const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const setPlayingState = (state) => {
        setIsPlaying(state);
        isPlayingRef.current = state;
        if (silentSoundRef.current) {
            if (state) {
                silentSoundRef.current.playAsync().catch(() => {});
            } else {
                silentSoundRef.current.pauseAsync().catch(() => {});
            }
        }
    };`;

const replacement = `    const setPlayingState = (state) => {
        setIsPlaying(state);
        isPlayingRef.current = state;
        // Moved silentSound control to playFromIndex and togglePlay to ensure it is fully awaited
        // BEFORE starting Speech.speak(), otherwise it fades out the TTS.
    };`;

code = code.replace(target, replacement);

const target2 = `        if (isPlayingRef.current) {
            isPlayingRef.current = false;
            setPlayingState(false);
            Speech.stop();`;

const replacement2 = `        if (isPlayingRef.current) {
            isPlayingRef.current = false;
            setPlayingState(false);
            Speech.stop();
            if (silentSoundRef.current) silentSoundRef.current.pauseAsync().catch(()=>{});
            TrackPlayer.pause().catch(()=>{});`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
console.log("SUCCESS");
