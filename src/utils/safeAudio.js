import { setAudioModeAsync, createAudioPlayer } from 'expo-audio';

let Audio = {
    setAudioModeAsync: async (options) => {
        const mode = {};
        if (options.playsInSilentModeIOS !== undefined) mode.playsInSilentMode = options.playsInSilentModeIOS;
        if (options.staysActiveInBackground !== undefined) mode.shouldPlayInBackground = options.staysActiveInBackground;
        if (options.interruptionModeIOS === 2) mode.interruptionMode = 'duckOthers';
        else if (options.interruptionModeIOS === 1) mode.interruptionMode = 'mixWithOthers';
        else if (options.interruptionModeIOS === 3) mode.interruptionMode = 'doNotMix';
        
        try {
            await setAudioModeAsync(mode);
        } catch (e) {
            console.warn("safeAudio setAudioModeAsync failed:", e);
        }
    },
    Sound: {
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
            } catch (e) {
                console.warn("safeAudio createAsync failed:", e);
                return { sound: { playAsync: async ()=>{}, pauseAsync: async ()=>{}, unloadAsync: async ()=>{}, stopAsync: async ()=>{} } };
            }
        }
    },
    INTERRUPTION_MODE_IOS_DUCK_OTHERS: 2,
    INTERRUPTION_MODE_ANDROID_DUCK_OTHERS: 2
};

const hasExponentAV = true; // Always return true so it thinks we have audio capabilities

export { Audio, hasExponentAV };
