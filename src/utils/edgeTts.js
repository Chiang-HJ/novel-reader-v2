import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';

export const EdgeVoices = [
    { id: 'zh-CN-XiaoxiaoNeural', name: '曉曉 (女聲/溫柔)' },
    { id: 'zh-CN-YunxiNeural', name: '雲希 (男聲/陽光)' },
    { id: 'zh-CN-YunjianNeural', name: '雲健 (男聲/沈穩)' },
    { id: 'zh-TW-HsiaoChenNeural', name: '曉臻 (台灣女聲)' },
    { id: 'zh-TW-YunJheNeural', name: '雲哲 (台灣男聲)' },
];

function getLocalServerUrl() {
    // 動態取得 Expo 伺服器所在的電腦 IP
    if (Constants.expoConfig && Constants.expoConfig.hostUri) {
        const host = Constants.expoConfig.hostUri.split(':')[0];
        return `http://${host}:5000`;
    }
    // Expo Go 開發模式預設通常會是這個
    return 'http://127.0.0.1:5000';
}

export async function generateAudioChunk(text, voiceId, chunkIndex) {
    const serverUrl = getLocalServerUrl();
    const apiUrl = `${serverUrl}/api/tts`;
    
    try {
        // 1. 請 Python 後端幫忙向微軟取得音檔 (避開 403 問題)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                voice: voiceId,
                rate: '+0%',
                pitch: '+0Hz'
            })
        });
        
        if (!response.ok) {
            throw new Error(`後端伺服器回應錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.error) {
            throw new Error(`TTS 轉換失敗: ${data.error}`);
        }
        
        // 2. 組合音檔網址
        const audioUrl = `${serverUrl}${data.audio_url}`;
        
        // 3. 下載音檔到手機快取資料夾
        const fileUri = `${FileSystem.cacheDirectory}tts_chunk_${chunkIndex}_${Date.now()}.mp3`;
        const { uri } = await FileSystem.downloadAsync(audioUrl, fileUri);
        
        return uri;
    } catch (e) {
        if (e.message.includes('Network request failed')) {
            throw new Error('無法連線到您的電腦後端。請確認您電腦上的桌面 tts-tool (app.py) 正在執行中，且手機與電腦在同一個 WiFi 下。');
        }
        throw e;
    }
}
