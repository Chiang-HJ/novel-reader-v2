const fs = require('fs');
const content = \import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';
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
    const watchdogTimerRef = useRef(null);

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

        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = setTimeout(() => {
            if (activeTaskRef.current?.id === task.id) {
                Alert.alert('下載超時', '下載任務已超時 (45秒)，請確認網路狀態後重試');
                completeTask();
            }
        }, 45000);
    };

    const completeTask = () => {
        if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
        }
        
        setTwitterQueue(prev => {
            const nextQueue = prev.slice(1);
            if (nextQueue.length === 0) {
                setIsDownloadingTwitter(false);
                setActiveTwitterTask(null);
                activeTaskRef.current = null;
                setTwitterProgressText('');
            } else {
                setTimeout(() => processNextTask(nextQueue[0]), 500);
            }
            return nextQueue;
        });
    };

    const handleMessage = async (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            
            if (data.type === 'EXTRACT_ERROR') {
                const message = data.message || '';
                const errorMsg = message === 'ERROR_NO_VIDEO' ? '找不到影片，可能是私人推文或需要登入' : '解析網址發生錯誤';
                Alert.alert('下載失敗', errorMsg);
                completeTask();
                return;
            }

            if (data.type === 'EXTRACT_SUCCESS') {
                const { urls, textContent } = data.data;
                
                if (!urls || urls.length === 0) {
                    Alert.alert('下載失敗', data.error || '無法取得媒體連結');
                    completeTask();
                    return;
                }

                // If isDirectExtract, we pass back to the caller instead of saving to vault?
                // For now, always save to vault.
                
                let newlyAddedMedia = [];
                try {
                    const vaultDir = FileSystem.documentDirectory + 'vault_media/';
                    const dirInfo = await FileSystem.getInfoAsync(vaultDir);
                    if (!dirInfo.exists) {
                        await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
                    }

                    for (let i = 0; i < urls.length; i++) {
                        try {
                            const fileUrl = urls[i];
                            const isImage = fileUrl.toLowerCase().includes('.jpg') || fileUrl.toLowerCase().includes('.jpeg') || fileUrl.toLowerCase().includes('.png');
                            const ext = isImage ? '.jpg' : '.mp4';
                            const type = isImage ? 'image' : 'video';

                            const uniqueId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
                            const fileName = uniqueId + '_twitter' + ext;
                            const destUri = vaultDir + fileName;

                            const downloadResumable = FileSystem.createDownloadResumable(fileUrl, destUri, {}, (prog) => {
                                setTwitterProgressText(\\\下載進度 \\\/\\\: \\\%\\\);
                            });
                            const downloadResult = await downloadResumable.downloadAsync();
                            if (!downloadResult || downloadResult.status !== 200) continue;

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
                                title: urls.length > 1 ? \\\Twitter 檔案 (\\\/\\\)\\\ : 'Twitter 檔案',
                                description: textContent
                            };
                            newlyAddedMedia.push(newItem);
                        } catch (itemErr) {
                            // Continue to next media item
                        }
                    }

                    if (newlyAddedMedia.length > 0) {
                        const VAULT_MEDIA_KEY = '@vault_media';
                        const stored = await AsyncStorage.getItem(VAULT_MEDIA_KEY);
                        let currentMedia = stored ? JSON.parse(stored) : [];
                        const newMedia = [...newlyAddedMedia, ...currentMedia];
                        await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMedia));
                        setVaultMediaUpdated(Date.now());
                        Alert.alert('下載完成', \\\已將 \\\ 個媒體檔案加入私密金庫。\\\);
                    } else {
                        Alert.alert('下載失敗', '沒有下載任何檔案。');
                    }
                } catch (e) {
                    Alert.alert('下載錯誤', e.message);
                } finally {
                    completeTask();
                }
            }
        } catch (e) {
            completeTask();
        }
    };

    const value = useMemo(() => ({
        downloadTwitterVideo,
        twitterQueue,
        activeTwitterTask,
        twitterProgressText,
        isDownloadingTwitter,
        vaultMediaUpdated
    }), [twitterQueue, activeTwitterTask, twitterProgressText, isDownloadingTwitter, vaultMediaUpdated]);

    return (
        <TwitterDownloadContext.Provider value={value}>
            {children}
            {activeTwitterTask && (
                <WebView
                    key={activeTwitterTask.id}
                    source={{ uri: activeTwitterTask.url }}
                    injectedJavaScript={\\\
                        (function() {
                            function extractMedia() {
                                try {
                                    const videos = document.querySelectorAll('video');
                                    let urls = [];
                                    
                                    if (videos.length > 0) {
                                        videos.forEach(v => {
                                            if (v.src && v.src.startsWith('http')) urls.push(v.src);
                                        });
                                    }

                                    if (urls.length === 0) {
                                        const images = document.querySelectorAll('img[src*="format=jpg"], img[src*="format=png"]');
                                        images.forEach(img => {
                                            if (img.src && !img.src.includes('profile_images')) {
                                                urls.push(img.src.replace(/&name=[^&]+/, '&name=large'));
                                            }
                                        });
                                    }

                                    if (urls.length > 0) {
                                        const article = document.querySelector('[data-testid="tweetText"]');
                                        const textContent = article ? article.innerText : '';
                                        
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'EXTRACT_SUCCESS',
                                            data: { urls: [...new Set(urls)], textContent }
                                        }));
                                    } else {
                                        setTimeout(extractMedia, 1000);
                                    }
                                } catch (e) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({
                                        type: 'EXTRACT_ERROR',
                                        message: e.message
                                    }));
                                }
                            }
                            
                            setTimeout(extractMedia, 2000);
                        })();
                        true;
                    \\\}
                    onMessage={handleMessage}
                    style={{ height: 0, width: 0, opacity: 0, position: 'absolute' }}
                    userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
                />
            )}
        </TwitterDownloadContext.Provider>
    );
};
\;
fs.writeFileSync('src/context/TwitterDownloadContext.js', content, 'utf8');
