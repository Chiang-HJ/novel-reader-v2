import { Audio } from 'expo-av';
import { generateAudioChunk } from './edgeTts';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

class EdgeTTSPlayer {
    constructor() {
        this.queue = [];
        this.voiceId = 'zh-CN-XiaoxiaoNeural';
        this.currentIndex = 0;
        
        this.currentSound = null;
        this.nextSound = null;
        
        this.isPlaying = false;
        this.onProgress = null;
        this.onFinish = null;
    }

    chunkText(text) {
        // Split by punctuation to create short chunks for instant synthesis
        const regex = /([^。！？；\n]+[。！？；\n]*)/g;
        let chunks = text.match(regex) || [text];
        return chunks.map(c => c.trim()).filter(c => c.length > 0);
    }

    async play(text, voiceId, onProgress, onFinish) {
        await this.stop();
        this.queue = this.chunkText(text);
        this.voiceId = voiceId;
        this.currentIndex = 0;
        this.isPlaying = true;
        this.onProgress = onProgress;
        this.onFinish = onFinish;

        // Configure audio session for background playback in Expo Go
        await Audio.setAudioModeAsync({
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
            shouldDuckAndroid: true,
            interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
            playThroughEarpieceAndroid: false
        });

        await this._playCurrentChunk();
    }

    async pause() {
        this.isPlaying = false;
        if (this.currentSound) {
            await this.currentSound.pauseAsync();
        }
    }

    async resume() {
        this.isPlaying = true;
        if (this.currentSound) {
            await this.currentSound.playAsync();
        } else {
            await this._playCurrentChunk();
        }
    }

    async stop() {
        this.isPlaying = false;
        if (this.currentSound) {
            try {
                await this.currentSound.stopAsync();
                await this.currentSound.unloadAsync();
            } catch(e) {}
            this.currentSound = null;
        }
        if (this.nextSound) {
            try {
                await this.nextSound.unloadAsync();
            } catch(e) {}
            this.nextSound = null;
        }
        this.queue = [];
        this.currentIndex = 0;
        
        this._cleanupCache();
    }

    async _cleanupCache() {
        try {
            const dir = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
            for (let file of dir) {
                if (file.startsWith('tts_chunk_')) {
                    await FileSystem.deleteAsync(FileSystem.cacheDirectory + file, { idempotent: true });
                }
            }
        } catch(e) {}
    }

    async _playCurrentChunk() {
        if (this.currentIndex >= this.queue.length || !this.isPlaying) {
            if (this.currentIndex >= this.queue.length && this.onFinish) {
                this.isPlaying = false;
                this.onFinish();
            }
            return;
        }

        const chunkText = this.queue[this.currentIndex];
        if (this.onProgress) {
            this.onProgress(this.currentIndex, this.queue.length, chunkText);
        }

        try {
            if (this.nextSound) {
                this.currentSound = this.nextSound;
                this.nextSound = null;
            } else {
                const fileUri = await generateAudioChunk(chunkText, this.voiceId, this.currentIndex);
                const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
                this.currentSound = sound;
            }

            // Fire and forget preload for next chunk
            this._preloadNextChunk();

            this.currentSound.setOnPlaybackStatusUpdate(this._onPlaybackStatusUpdate.bind(this));
            await this.currentSound.playAsync();
        } catch (e) {
            console.warn("TTS Playback Error: ", e);
            Alert.alert("語音播放錯誤", e.message || String(e));
            this.isPlaying = false;
        }
    }

    async _preloadNextChunk() {
        const nextIndex = this.currentIndex + 1;
        if (nextIndex < this.queue.length && this.isPlaying) {
            try {
                const fileUri = await generateAudioChunk(this.queue[nextIndex], this.voiceId, nextIndex);
                const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
                this.nextSound = sound;
            } catch(e) {
                console.warn("Failed to preload chunk", e);
            }
        }
    }

    _onPlaybackStatusUpdate(status) {
        if (status.didJustFinish) {
            if (this.currentSound) {
                this.currentSound.unloadAsync().catch(() => {});
            }
            this.currentSound = null;
            this.currentIndex++;
            this._playCurrentChunk();
        }
    }
}

export const audioPlayer = new EdgeTTSPlayer();
