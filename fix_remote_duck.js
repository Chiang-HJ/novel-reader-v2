const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `        } else if (event.type === Event.RemoteDuck) {
            if (event.paused && isPlayingRef.current) {
                togglePlay();
            }
        }`;

const replacement = `        } else if (event.type === Event.RemoteDuck) {
            if (event.paused) {
                wasPlayingBeforeDuckRef.current = isPlayingRef.current;
                if (isPlayingRef.current) {
                    togglePlay();
                }
            } else {
                if (wasPlayingBeforeDuckRef.current && !isPlayingRef.current) {
                    togglePlay();
                }
                wasPlayingBeforeDuckRef.current = false;
            }
        }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
