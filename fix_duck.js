const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    useTrackPlayerEvents([`;
const replacement = `    const wasPlayingBeforeDuckRef = useRef(false);
    useTrackPlayerEvents([`;

code = code.replace(target, replacement);

const targetDuck = `        } else if (event.type === Event.RemoteDuck) {
            if (event.paused && isPlayingRef.current) {
                togglePlay();
            }
        }`;

const replaceDuck = `        } else if (event.type === Event.RemoteDuck) {
            if (event.paused) {
                if (isPlayingRef.current) {
                    wasPlayingBeforeDuckRef.current = true;
                    togglePlay();
                }
            } else {
                if (wasPlayingBeforeDuckRef.current) {
                    wasPlayingBeforeDuckRef.current = false;
                    if (!isPlayingRef.current) {
                        togglePlay();
                    }
                }
            }
        }`;

code = code.replace(targetDuck, replaceDuck);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
