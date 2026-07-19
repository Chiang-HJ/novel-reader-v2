import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';

const TwitterDownloadContext = createContext();

export const useTwitterDownload = () => useContext(TwitterDownloadContext);

export const TwitterDownloadProvider = ({ children }) => {
    const [twitterQueue, setTwitterQueue] = useState([]);
    const [activeTwitterTask, setActiveTwitterTask] = useState(null);
    const [twitterProgressText, setTwitterProgressText] = useState('');
    const [isDownloadingTwitter, setIsDownloadingTwitter] = useState(false);
    
    // Global flag for UI updates
    const [vaultMediaUpdated, setVaultMediaUpdated] = useState(Date.now());

    const activeTaskRef = useRef(null);

    useEffect(() => {
        if (twitterQueue.length > 0 && !activeTaskRef.current) {
            processNextTask(twitterQueue[0]);
        }
    }, [twitterQueue]);

    const downloadTwitterVideo = (url, isDirectExtract = false) => {
        if (!url) return;
        const task = {
            id: Date.now().toString(),
            url,
            isDirectExtract
        };
        setTwitterQueue(prev => [...prev, task]);
    };

    const processNextTask = (task) => {
        activeTaskRef.current = task;
        setActiveTwitterTask(task);
        setIsDownloadingTwitter(true);
        setTwitterProgressText('準備下載...');
    };

    const completeTask = () => {
        setTwitterQueue(prev => prev.slice(1));
        activeTaskRef.current = null;
        setActiveTwitterTask(null);
        setIsDownloadingTwitter(false);
        setTwitterProgressText('');
    };

    const handleWebViewMessage = async (event) => {
        const message = event.nativeEvent.data;
        
        if (message === 'TIMEOUT' || message.startsWith('ERROR')) {
            const errorMsg = message === 'ERROR_NO_VIDEO' ? '找不到影片，若為私人推文請手動登入。' : '解析網頁時發生錯誤';
            Alert.alert('下載失敗', errorMsg);
            completeTask();
            return;
        }
        
        let urls = [];
        let textContent = '';
        if (message.startsWith('{')) {
            try {
                const data = JSON.parse(message);
                if (data.error) {
                    Alert.alert('下載失敗', data.error);
                    completeTask();
                    return;
                }
                if (data.urls) urls = data.urls;
                if (data.url) urls = [data.url];
                if (data.text) textContent = data.text;
            } catch(e) {}
        } else if (message.startsWith('[')) {
            try { urls = JSON.parse(message); } catch(e) {}
        } else if (message.startsWith('http')) {
            urls = [message];
        }

        if (urls.length > 0) {
            let newlyAddedMedia = [];
            try {
                const vaultDir = FileSystem.documentDirectory + 'vault_media/';
                const dirInfo = await FileSystem.getInfoAsync(vaultDir);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
                }

                for (let i = 0; i < urls.length; i++) {
                    const fileUrl = urls[i];
                    const isImage = fileUrl.toLowerCase().includes('.jpg') || fileUrl.toLowerCase().includes('.jpeg') || fileUrl.toLowerCase().includes('.png');
                    const ext = isImage ? '.jpg' : '.mp4';
                    const type = isImage ? 'image' : 'video';

                    const uniqueId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
                    const fileName = uniqueId + '_twitter' + ext;
                    const destUri = vaultDir + fileName;

                    const downloadResumable = FileSystem.createDownloadResumable(fileUrl, destUri, {}, (prog) => { 
                        setTwitterProgressText(`下載中 ${i+1}/${urls.length}: ${Math.round((prog.totalBytesWritten / prog.totalBytesExpectedToWrite) * 100)}%`); 
                    });
                    const downloadResult = await downloadResumable.downloadAsync();
                    if (downloadResult.status !== 200) continue;

                    let thumbnailUri = null;
                    if (type === 'video') {
                        try {
                            const { uri: tUri } = await VideoThumbnails.getThumbnailAsync(destUri, { time: 1000 });
                            const tFileName = 'thumb_' + uniqueId + '.jpg';
                            const newTUri = vaultDir + tFileName;
                            await FileSystem.copyAsync({ from: tUri, to: newTUri });
                            thumbnailUri = newTUri;
                        } catch (e) {}
                    }

                    const newItem = {
                        id: uniqueId,
                        uri: destUri,
                        thumbnailUri,
                        type: type,
                        createdAt: Date.now(),
                        tags: ['twitter'],
                        title: urls.length > 1 ? `Twitter 檔案 (${i+1}/${urls.length})` : 'Twitter 檔案',
                        description: textContent
                    };
                    newlyAddedMedia.push(newItem);
                }

                if (newlyAddedMedia.length > 0) {
                    const VAULT_MEDIA_KEY = '@novel_reader_vault_media';
                    const stored = await AsyncStorage.getItem(VAULT_MEDIA_KEY);
                    let currentMedia = stored ? JSON.parse(stored) : [];
                    const newMedia = [...newlyAddedMedia, ...currentMedia];
                    await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMedia));
                    setVaultMediaUpdated(Date.now());
                    Alert.alert('下載成功', `成功儲存 ${newlyAddedMedia.length} 個媒體檔案。`);
                } else {
                    Alert.alert('下載失敗', '無法下載檔案。');
                }
            } catch (e) {
                Alert.alert('下載錯誤', e.message);
            } finally {
                completeTask();
            }
        } else {
            completeTask();
        }
    };

    return (
        <TwitterDownloadContext.Provider value={{ 
            twitterQueue, 
            activeTwitterTask, 
            twitterProgressText, 
            isDownloadingTwitter, 
            downloadTwitterVideo,
            handleWebViewMessage,
            cancelTwitterDownload: completeTask,
            vaultMediaUpdated
        }}>
            {children}
        </TwitterDownloadContext.Provider>
    );
};
