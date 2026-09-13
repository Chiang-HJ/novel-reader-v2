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
        if (silentSoundRef.current) {
            if (state) {
                silentSoundRef.current.playAsync().catch(() => {});
                TrackPlayer.play().catch(() => {});
            } else {
                silentSoundRef.current.pauseAsync().catch(() => {});
                TrackPlayer.pause().catch(() => {});
            }
        }
    };`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
