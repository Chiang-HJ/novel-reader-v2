import { NativeModules } from 'react-native';

const hasExponentAV = !!(NativeModules && NativeModules.ExponentAV);

let Audio = {
    setAudioModeAsync: async () => {},
    Sound: {
        createAsync: async () => ({ sound: { playAsync: async () => {}, pauseAsync: async () => {}, unloadAsync: async () => {}, stopAsync: async () => {} } })
    },
    INTERRUPTION_MODE_IOS_DUCK_OTHERS: 2,
    INTERRUPTION_MODE_ANDROID_DUCK_OTHERS: 2
};

if (hasExponentAV) {
    try {
        const AV = require('expo-av');
        if (AV.Audio) {
            Audio = AV.Audio;
        }
    } catch (e) {}
}

export { Audio, hasExponentAV };
