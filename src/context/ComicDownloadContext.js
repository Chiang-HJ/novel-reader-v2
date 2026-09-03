import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveNovelToBookshelf, saveComicChapterData, saveComicImage, getNovelMetadata } from '../utils/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getScramblePieces } from '../utils/comicUtils';
import { startBackgroundKeepAlive, stopBackgroundKeepAlive } from '../utils/backgroundKeepAlive';
import { getParserForUrl } from '../utils/parsers';

import DescrambleWebView from '../components/DescrambleWebView';

const ComicDownloadContext = createContext();

export const useComicDownload = () => useContext(ComicDownloadContext);

export const ComicDownloadProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);
    const [activeTask, setActiveTask] = useState(null);
    const [scrapeUrl, setScrapeUrl] = useState(null);
    const [progressText, setProgressText] = useState('');
    const [bookshelfUpdated, setBookshelfUpdated] = useState(Date.now());
    const [activeTaskProgress, setActiveTaskProgress] = useState(null);
    
    // "album" = info mode, "photo" = chapter mode
    const [scrapeMode, setScrapeMode] = useState(null); 

    const webViewRef = useRef(null);
    const descrambleWebViewRef = useRef(null);
    const activeTaskRef = useRef(null);
    const cancelFlagRef = useRef(new Set());
    const chapterHtmlResolveRef = useRef(null);

    useEffect(() => {
        if (queue.length > 0 && !activeTaskRef.current) {
            processNextTask(queue[0]);
        }
    }, [queue]);

    useEffect(() => {
        return () => {
            if (chapterHtmlResolveRef.current) {
                chapterHtmlResolveRef.current.reject(new Error('unmounted'));
            }
        };
    }, []);

    const startDownload = (comic) => {
        // comic should have { id, title, cover, url }
        setQueue(prevQueue => {
            if (prevQueue.find(q => q.id === comic.id)) return prevQueue;
            if (activeTaskRef.current && activeTaskRef.current.id === comic.id) return prevQueue;
            cancelFlagRef.current.delete(comic.id);
            return [...prevQueue, { ...comic, addedAt: Date.now() }];
        });
        Alert.alert('加入下載', '已加入下載隊列: ' + comic.title);
    };

    const cancelDownload = (comicId) => {
        setQueue(prev => prev.filter(q => q.id !== comicId));
        cancelFlagRef.current.add(comicId);
        stopBackgroundKeepAlive('comic_download');
        if (activeTaskRef.current && activeTaskRef.current.id === comicId) {
            setScrapeUrl(null);
            if (chapterHtmlResolveRef.current) {
                chapterHtmlResolveRef.current.reject(new Error('cancelled'));
            }
            setActiveTask(null);
            activeTaskRef.current = null;
            setProgressText('');
        }
    };

    const processNextTask = async (task) => {
        startBackgroundKeepAlive('comic_download');
        activeTaskRef.current = task;
        setActiveTask(task);
        setProgressText('正在取得漫畫資訊...');
        
        try {
            const parser = getParserForUrl(task.url);
            const isJMComic = parser && parser.domain && (parser.domain.includes('18comic') || parser.domain.includes('jmcomic'));
            
            // Prevent double prefixing if task.id already has the prefix
            const novelId = task.id.startsWith('comic_') ? task.id : 'comic_' + (parser ? parser.name : '18comic') + '_' + task.id;
            const existingNovel = await getNovelMetadata(novelId);
            const initialDownloadedCount = existingNovel ? (existingNovel.downloadedChapters || 0) : 0;
            
            const novelData = {
                id: novelId,
                title: task.title,
                url: task.url,
                cover: task.cover,
                type: 'comic',
                folderId: 'vault',
                isHidden: true,
                // JMComic: images are descrambled offline at download time, so mark as true.
                // boylove: unknown until we check the chapter HTML. Start as false (assume scrambled).
                //          Will be updated to true per-chapter if server sends unscrambled images.
                isDescrambled: isJMComic ? true : false,
                chapters: [],
                downloadedChapters: initialDownloadedCount,
                chapterCount: 0
            };
            
            let chapters = [];
            if (isJMComic) {
                // JMComic uses WebView to parse album page
                const albumData = await fetchHtmlViaWebView(task.url, 'album');
                if (cancelFlagRef.current.has(task.id)) throw new Error('Cancelled');
                
                const html = albumData.html || '';
                const author = albumData.author || '';
                if (author) novelData.author = author;
                else {
                    const authorMatch = html.match(/data-original-title="作者"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) 
                        || html.match(/itemprop="author"[^>]*>([^<]+)<\/a>/i)
                        || html.match(/作者[：:]\s*<a[^>]*>([^<]+)<\/a>/i);
                    if (authorMatch && authorMatch[1]) novelData.author = authorMatch[1].trim();
                }
                
                chapters = parseAlbumChapters(html, task.url);
            } else if (parser.parseInfo) {
                // Use parser directly (e.g. boylove)
                const res = await fetch(task.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                const html = await res.text();
                if (cancelFlagRef.current.has(task.id)) throw new Error('Cancelled');
                
                const info = parser.parseInfo(html, task.url);
                if (info.author) novelData.author = info.author;
                chapters = info.chapters || [];
            }
            
            if (chapters.length === 0) {
                throw new Error('找不到章節資訊');
            }
            
            novelData.chapters = chapters;
            novelData.chapterCount = chapters.length;
            await saveNovelToBookshelf(novelData);
            setBookshelfUpdated(Date.now());
            
            // Calculate how many chapters are already downloaded based on .json files
            let downloadedCount = 0;
            const downloadedFlags = [];
            if (chapters.length > 0) {
                for (let i = 0; i < chapters.length; i++) {
                    const jsonPath = FileSystem.documentDirectory + `novels/${novelId}/${i}.json`;
                    const jsonInfo = await FileSystem.getInfoAsync(jsonPath);
                    if (jsonInfo.exists) {
                        downloadedFlags[i] = true;
                        downloadedCount++;
                    } else {
                        downloadedFlags[i] = false;
                    }
                }
            }

            const progressArray = chapters.map((ch, idx) => ({
                index: idx,
                title: ch.title,
                url: ch.url,
                status: downloadedFlags[idx] ? 'success' : 'pending'
            }));
            setActiveTaskProgress(progressArray);
            
            // Step 2: Download each chapter
            for (let i = 0; i < chapters.length; i++) {
                if (cancelFlagRef.current.has(task.id)) throw new Error('Cancelled');
                if (downloadedFlags[i]) continue;
                
                const chapter = chapters[i];
                
                setActiveTaskProgress(prev => {
                    if(!prev) return prev;
                    const next = [...prev];
                    if (next[i]) next[i] = { ...next[i], status: 'downloading' };
                    return next;
                });
                
                setProgressText('正在下載: ' + chapter.title + ' (' + (i + 1) + '/' + chapters.length + ')');
                
                try {
                    let images = [];
                    let cookies = '';
                    let chapterResult = null;
                    let fetchResult = null;
                    if (isJMComic) {
                        const taskDomain = task.url ? task.url.split('/').slice(0, 3).join('/') : 'https://18comic.org';
                        const chapterUrl = chapter.url.startsWith('http') ? chapter.url : (taskDomain + chapter.url);
                        chapterResult = await fetchHtmlViaWebView(chapterUrl, 'photo');
                        if (chapterResult.error) throw new Error(chapterResult.error);
                        images = chapterResult.images;
                        cookies = chapterResult.cookies;
                    } else if (parser.fetchChapterImages) {
                        fetchResult = await parser.fetchChapterImages(chapter.url);
                        if (fetchResult && fetchResult.images) {
                            images = fetchResult.images;
                        } else if (Array.isArray(fetchResult)) {
                            images = fetchResult;
                        }
                    }
                    
                    if (!images || images.length === 0) {
                        throw new Error('章節 ' + chapter.title + ' 下載失敗 (無圖片)');
                    }
                    
                    // Save images
                    const localPages = [];
                    for (let j = 0; j < images.length; j++) {
                        const base64OrUrl = images[j];
                        const pct = Math.round(((j + 1) / images.length) * 100);
                        setProgressText(`[第 ${i + 1}/${chapters.length} 話] 下載圖片 (${j + 1}/${images.length}) - ${pct}%`);
                        let localPath = await saveComicImage(novelId, chapter.id, j, base64OrUrl, cookies);
                        
                        // Offline Descrambling
                        try {
                            if (isJMComic && descrambleWebViewRef.current && chapterResult && chapterResult.images) {
                                setProgressText(`[第 ${i + 1}/${chapters.length} 話] 解密重組 (${j + 1}/${chapterResult.images.length})...`);
                                
                                let photo_id = parseInt(chapter.id, 10);
                                let originalFilename = `${j}.jpg`;
                                
                                if (typeof base64OrUrl === 'string' && base64OrUrl.startsWith('http')) {
                                    const urlWithoutParams = base64OrUrl.split('?')[0];
                                    const urlParts = urlWithoutParams.split('/');
                                    const urlFilename = urlParts[urlParts.length - 1];
                                    const urlPhotoSegment = urlParts[urlParts.length - 2];
                                    
                                    if (urlFilename && urlFilename.includes('.')) originalFilename = urlFilename;
                                    const parsedId = parseInt(urlPhotoSegment, 10);
                                    if (!isNaN(parsedId) && parsedId > 0) photo_id = parsedId;
                                }
                                
                                const num = getScramblePieces(photo_id, originalFilename);
                                if (num > 1) {
                                    let mimeType = 'image/jpeg';
                                    if (localPath.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
                                    else if (localPath.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                                    let scrambledBase64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
                                    const descrambledBase64 = await descrambleWebViewRef.current.descramble(scrambledBase64, num, mimeType);
                                    const cleanBase64 = descrambledBase64.replace(/^data:image\/\w+;base64,/, '');
                                    
                                    const newPath = localPath.replace(/\.webp$/i, '.jpg').replace(/\.png$/i, '.jpg');
                                    await FileSystem.writeAsStringAsync(newPath, cleanBase64, { encoding: FileSystem.EncodingType.Base64 });
                                    
                                    if (newPath !== localPath) {
                                        try { await FileSystem.deleteAsync(localPath, { idempotent: true }); } catch (e) {}
                                        localPath = newPath;
                                    }
                                }
                            }
                        } catch(e) {}
                        
                        localPages.push(localPath);
                    }
                    
                    await saveComicChapterData(novelId, i, chapter.title, localPages, fetchResult?.isScrambled);
                    downloadedCount++;
                    
                    // Update novel metadata
                    novelData.downloadedChapters = downloadedCount;
                    await saveNovelToBookshelf(novelData);
                    setBookshelfUpdated(Date.now());

                    setActiveTaskProgress(prev => {
                        if(!prev) return prev;
                        const next = [...prev];
                        if (next[i]) next[i] = { ...next[i], status: 'success' };
                        return next;
                    });
                } catch (chErr) {
                    if (chErr.message === 'Cancelled') throw chErr;
                    
                    setActiveTaskProgress(prev => {
                        if(!prev) return prev;
                        const next = [...prev];
                        if (next[i]) next[i] = { ...next[i], status: 'error' };
                        return next;
                    });
                    // Continue to next chapter!
                }
            }
            
            setProgressText('下載完成！');
            setTimeout(() => {
                if (activeTaskRef.current && activeTaskRef.current.id === task.id) {
                    setActiveTask(null);
                    activeTaskRef.current = null;
                    setQueue(prev => prev.slice(1));
                    setActiveTaskProgress(null);
                    setProgressText('');
                    stopBackgroundKeepAlive('comic_download');
                }
            }, 2000);
            
        } catch (e) {

            if (e.message !== 'Cancelled') {
                Alert.alert('下載失敗', '漫畫 ' + task.title + ' 下載中斷: ' + e.message);
            }
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.slice(1));
            setActiveTaskProgress(null);
            setProgressText('');
            stopBackgroundKeepAlive('comic_download');
        }
    };

    const retryFailedChapters = async (comicId) => {
        const novel = await getNovelById(comicId);
        if (novel) {
            startDownload(novel);
        }
    };

    const retryChapterDownload = async (comicId, chapterIndex) => {
        try {
            // Delete the JSON file so it gets recognized as missing
            const jsonPath = FileSystem.documentDirectory + `novels/${comicId}/${chapterIndex}.json`;
            await FileSystem.deleteAsync(jsonPath, { idempotent: true });
            
            // Delete the images directory
            const novel = await getNovelById(comicId);
            // Calculate how many chapters are already downloaded based on .json files
            let initialDownloadedCount = 0;
            const downloadedFlags = [];
            if (novel && novel.chapters && novel.chapters.length > 0) {
                for (let i = 0; i < novel.chapters.length; i++) {
                    const jsonPath = FileSystem.documentDirectory + `novels/${comicId}/${i}.json`;
                    const jsonInfo = await FileSystem.getInfoAsync(jsonPath);
                    if (jsonInfo.exists) {
                        downloadedFlags[i] = true;
                        initialDownloadedCount++;
                    } else {
                        downloadedFlags[i] = false;
                    }
                }
            }
            
            // We don't need to manually delete images because saveComicImage overwrites them
            // based on chapterId_index.jpg naming.
            // Start download again
            if (novel) {
                startDownload(novel);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const [scrapeId, setScrapeId] = useState(0);

    const fetchHtmlViaWebView = (url, mode) => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (chapterHtmlResolveRef.current) {
                    chapterHtmlResolveRef.current = null;
                    reject(new Error('網頁載入逾時 (65秒)，可能受驗證阻擋'));
                }
            }, 65000);
            setScrapeMode(mode);
            setScrapeId(prev => prev + 1);
            chapterHtmlResolveRef.current = {
                resolve: (data) => {
                    clearTimeout(timer);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            };
            setScrapeUrl(url);
        });
    };

    const parseAlbumChapters = (html, taskUrl) => {
        const chapters = [];
        const taskUrlDomain = taskUrl ? taskUrl.split('/').slice(0, 3).join('/') : 'https://18comic.org';
        
        // Extract album ID from task URL
        const albumIdMatch = taskUrl ? taskUrl.match(/\/album\/(\d+)/) : null;
        const albumId = albumIdMatch ? albumIdMatch[1] : '';
        
        // Try to find the episode/chapter section only
        // 18comic uses class="episode" or similar containers for chapter lists
        const episodeMatch = html.match(/<div[^>]*class="[^"]*episode[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
            || html.match(/<ul[^>]*class="[^"]*btn-toolbar[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)
            || html.match(/<div[^>]*class="[^"]*episode[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        
        const searchHtml = episodeMatch ? episodeMatch[0] : '';
        
        if (searchHtml) {
            // Multi-chapter: only extract links from the episode section
            const regex = /<a[^>]*href=["']([^"']*\/photo\/\d+\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            const seenIds = new Set();
            
            while ((match = regex.exec(searchHtml)) !== null) {
                const url = match[1];
                const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
                const idMatch = url.match(/\/photo\/(\d+)/);
                const id = idMatch ? idMatch[1] : '';
                
                if (id && !seenIds.has(id)) {
                    seenIds.add(id);
                    const absoluteUrl = url.startsWith('http') ? url : (taskUrlDomain + url);
                    chapters.push({ title: rawTitle || ('\u7B2C' + (chapters.length + 1) + '\u7AE0'), url: absoluteUrl, id });
                }
            }
        }
        
        // If no chapters found from episode section, treat as single chapter
        if (chapters.length === 0 && albumId) {
            chapters.push({
                title: '\u958B\u59CB\u95B1\u8B80',
                url: taskUrlDomain + '/photo/' + albumId,
                id: albumId
            });
        }
        
        chapters.sort((a, b) => {
            const numA = parseInt(a.id) || 0;
            const numB = parseInt(b.id) || 0;
            return numA - numB;
        });
        
        return chapters;
    };

    const onWebViewMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (chapterHtmlResolveRef.current) {
                const { resolve, reject } = chapterHtmlResolveRef.current;
                if (data.type === 'albumData') {
                    if (data.error) reject(new Error(data.error));
                    else resolve(data);
                    chapterHtmlResolveRef.current = null;
                } else if (data.type === 'photoData') {
                    if (data.error) reject(new Error(data.error));
                    else resolve(data);
                    chapterHtmlResolveRef.current = null;
                }
            }
        } catch (e) {}
    };

    const contextValue = useMemo(() => ({
        queue,
        activeTask,
        scrapeUrl,
        scrapeMode,
        scrapeId,
        progressText,
        bookshelfUpdated,
        activeTaskProgress,
        startDownload,
        cancelDownload,
        retryFailedChapters,
        retryChapterDownload,
        webViewRef,
        onWebViewMessage
    }), [queue, activeTask, scrapeUrl, scrapeMode, scrapeId, progressText, bookshelfUpdated, activeTaskProgress]);

    return (
        <ComicDownloadContext.Provider value={contextValue}>
            {children}
            {/* P1-C: Only mount DescrambleWebView when actually needed (queue has items) */}
            {(queue.length > 0 || activeTask !== null) && <DescrambleWebView ref={descrambleWebViewRef} />}
        </ComicDownloadContext.Provider>
    );
};
