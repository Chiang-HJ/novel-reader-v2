import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import { silentAudioBase64 } from './silentAudio';

let soundInstance = null;
const activeHolders = new Set();
let isInitializing = false;

const SILENT_FILE_PATH = FileSystem.cacheDirectory + 'silent_keep_alive.wav';

async function ensureSilentFile() {
    try {
        const info = await FileSystem.getInfoAsync(SILENT_FILE_PATH);
        if (!info.exists) {
            await FileSystem.writeAsStringAsync(SILENT_FILE_PATH, silentAudioBase64, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }
        return SILENT_FILE_PATH;
    } catch (e) {
        return null;
    }
}

/**
 * Start background keep-alive session:
 * 1. Activates screen keep-awake while in foreground
 * 2. Plays a silent background audio loop so iOS / Android keeps JS thread and network requests alive in background
 */
export async function startBackgroundKeepAlive(tag = 'default') {
    activeHolders.add(tag);
    
    // Prevent screen from turning off while downloading in foreground
    try {
        await activateKeepAwakeAsync(tag);
    } catch (e) {}

    if (soundInstance || isInitializing) return;
    isInitializing = true;

    try {
        // Configure audio session to stay active in background and allow mixing with other apps
        await Audio.setAudioModeAsync({
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            interruptionModeIOS: InterruptionModeIOS?.MixWithOthers ?? 1,
            interruptionModeAndroid: InterruptionModeAndroid?.DuckOthers ?? 2,
        });

        const uri = await ensureSilentFile();
        if (uri) {
            const { sound } = await Audio.Sound.createAsync(
                { uri },
                { isLooping: true, volume: 0.01, shouldPlay: true }
            );
            soundInstance = sound;
            await soundInstance.playAsync();
        }
    } catch (e) {
        // Fallback gracefully if audio initialization fails
    } finally {
        isInitializing = false;
        if (activeHolders.size === 0 && soundInstance) {
            try {
                await soundInstance.stopAsync();
                await soundInstance.unloadAsync();
            } catch (e) {}
            soundInstance = null;
        }
    }
}

/**
 * Stop background keep-alive session when all active tasks finish
 */
export async function stopBackgroundKeepAlive(tag = 'default') {
    activeHolders.delete(tag);
    try {
        await deactivateKeepAwake(tag);
    } catch (e) {}

    if (activeHolders.size === 0 && soundInstance) {
        try {
            await soundInstance.stopAsync();
            await soundInstance.unloadAsync();
        } catch (e) {}
        soundInstance = null;
    }
}
