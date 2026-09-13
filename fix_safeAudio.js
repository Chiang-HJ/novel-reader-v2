const fs = require('fs');
let code = fs.readFileSync('src/utils/safeAudio.js', 'utf8');

const target = `    Sound: {
        createAsync: async ({ uri }) => {
            try {
                const player = createAudioPlayer(uri);
                return {
                    sound: {
                        playAsync: async () => player.play(),
                        pauseAsync: async () => player.pause(),
                        unloadAsync: async () => player.release(),
                        stopAsync: async () => { player.pause(); player.seekTo(0); }
                    }
                };
            } catch (e) {`;

const replacement = `    Sound: {
        createAsync: async ({ uri }, options = {}) => {
            try {
                const player = createAudioPlayer(uri);
                if (options.isLooping !== undefined) player.loop = options.isLooping;
                if (options.volume !== undefined) player.volume = options.volume;
                
                return {
                    sound: {
                        playAsync: async () => player.play(),
                        pauseAsync: async () => player.pause(),
                        unloadAsync: async () => player.release(),
                        stopAsync: async () => { player.pause(); player.seekTo(0); },
                        setIsLoopingAsync: async (loop) => { player.loop = loop; }
                    }
                };
            } catch (e) {`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/safeAudio.js', code, 'utf8');
