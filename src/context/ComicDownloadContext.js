import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveNovelToBookshelf, saveComicChapterData, saveComicImage } from '../utils/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getScramblePieces } from '../utils/comicUtils';

import DescrambleWebView from '../components/DescrambleWebView';

const ComicDownloadContext = createContext();

export const useComicDownload = () => useContext(ComicDownloadContext);

export const ComicDownloadProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);
    const [activeTask, setActiveTask] = useState(null);
    const [scrapeUrl, setScrapeUrl] = useState(null);
    const [progressText, setProgressText] = useState('');
    const [bookshelfUpdated, setBookshelfUpdated] = useState(Date.now());
    
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
        activeTaskRef.current = task;
        setActiveTask(task);
        setProgressText('正在取得漫畫資訊...');
        
        try {
            // Step 1: Save basic metadata to bookshelf (Vault)
            const novelId = 'comic_18comic_' + task.id;
            const novelData = {
                id: novelId,
                title: task.title,
                url: task.url,
                cover: task.cover,
                type: 'comic',
                folderId: 'vault',
                isHidden: true,
                isDescrambled: true,
                chapters: [],
                downloadedChapters: 0,
                chapterCount: 0
            };
            
            // We use the WebView to parse the album page for chapters
            const albumData = await fetchHtmlViaWebView(task.url, 'album');
            if (cancelFlagRef.current.has(task.id)) throw new Error('Cancelled');
            
            const html = albumData.html || '';
            const author = albumData.author || '';
            
            // Debug alert for author extraction
            Alert.alert('DEBUG', 'Extracted Author: "' + author + '"');
            
            if (author) {
                novelData.author = author;
            } else {
                // Fallback to regex if JS extraction failed
                const authorMatch = html.match(/data-original-title="作者"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) 
                    || html.match(/itemprop="author"[^>]*>([^<]+)<\/a>/i)
                    || html.match(/作者[：:]\s*<a[^>]*>([^<]+)<\/a>/i);
                if (authorMatch && authorMatch[1]) {
                    novelData.author = authorMatch[1].trim();
                }
            }
            
            // Basic regex parsing for chapters (eps)
            const chapters = parseAlbumChapters(html, task.url);
            if (chapters.length === 0) {
                throw new Error('找不到章節資訊');
            }
            
            novelData.chapters = chapters;
            novelData.chapterCount = chapters.length;
            await saveNovelToBookshelf(novelData);
            setBookshelfUpdated(Date.now());
            
            // Step 2: Download each chapter
            let downloadedCount = 0;
            for (let i = 0; i < chapters.length; i++) {
                if (cancelFlagRef.current.has(task.id)) throw new Error('Cancelled');
                const chapter = chapters[i];
                
                setProgressText('正在下載: ' + chapter.title + ' (' + (i + 1) + '/' + chapters.length + ')');
                
                // Fetch chapter page and wait for JS descrambling
                const taskDomain = task.url ? task.url.split('/').slice(0, 3).join('/') : 'https://18comic.org';
                const chapterUrl = chapter.url.startsWith('http') ? chapter.url : (taskDomain + chapter.url);
                const chapterResult = await fetchHtmlViaWebView(chapterUrl, 'photo');
                
                if (chapterResult.error) throw new Error(chapterResult.error);
                if (!chapterResult.images || chapterResult.images.length === 0) {
                    throw new Error('章節 ' + chapter.title + ' 下載失敗');
                }
                
                // Save images
                const localPages = [];
                for (let j = 0; j < chapterResult.images.length; j++) {
                    const base64OrUrl = chapterResult.images[j];
                    setProgressText('正在下載圖片 (' + (j + 1) + '/' + chapterResult.images.length + ')...');
                    const localPath = await saveComicImage(novelId, chapter.id, j, base64OrUrl);
                    
                    // Offline Descrambling
                    try {
                        if (descrambleWebViewRef.current) {
                            setProgressText('正在解密重組 (' + (j + 1) + '/' + chapterResult.images.length + ')...');
                            const parts = localPath.split('/');
                            let filename = parts[parts.length - 1];
                            let photo_id = parseInt(chapter.id, 10);
                            
                            const nameParts = filename.split('_');
                            if (nameParts.length >= 2) {
                                photo_id = parseInt(nameParts[0], 10);
                                filename = nameParts.slice(1).join('_');
                            }
                            
                            const num = getScramblePieces(photo_id, filename);
                            if (num > 1) {
                                let mimeType = 'image/jpeg';
                                if (localPath.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
                                else if (localPath.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                                let scrambledBase64;
                                try {
                                    const { File } = require('expo-file-system');
                                    scrambledBase64 = await new File(localPath).base64();
                                } catch (e) {
                                    scrambledBase64 = await FileSystem.readAsStringAsync(localPath, { encoding: 'base64' });
                                }
                                const descrambledBase64 = await descrambleWebViewRef.current.descramble(scrambledBase64, num, mimeType);
                                const cleanBase64 = descrambledBase64.replace(/^data:image\/\w+;base64,/, '');
                                try {
                                    const { File } = require('expo-file-system');
                                    new File(localPath).write(cleanBase64, { encoding: 'base64' });
                                } catch (e) {
                                    await FileSystem.writeAsStringAsync(localPath, cleanBase64, { encoding: 'base64' });
                                }
                            }
                        }
                    } catch(e) {

                    }
                    
                    localPages.push(localPath);
                }
                
                await saveComicChapterData(novelId, i, chapter.title, localPages);
                downloadedCount++;
                
                // Update novel metadata
                novelData.downloadedChapters = downloadedCount;
                await saveNovelToBookshelf(novelData);
                setBookshelfUpdated(Date.now());
            }
            
            setProgressText('下載完成！');
            setTimeout(() => {
                if (activeTaskRef.current && activeTaskRef.current.id === task.id) {
                    setActiveTask(null);
                    activeTaskRef.current = null;
                    setQueue(prev => prev.slice(1));
                    setProgressText('');
                }
            }, 2000);
            
        } catch (e) {

            if (e.message !== 'Cancelled') {
                Alert.alert('下載失敗', '漫畫 ' + task.title + ' 下載中斷: ' + e.message);
            }
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.slice(1));
            setProgressText('');
        }
    };

    const [scrapeId, setScrapeId] = useState(0);

    const fetchHtmlViaWebView = (url, mode) => {
        return new Promise((resolve, reject) => {
            setScrapeMode(mode);
            setScrapeId(prev => prev + 1);
            chapterHtmlResolveRef.current = { resolve, reject };
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

    return (
        <ComicDownloadContext.Provider value={{
            queue,
            activeTask,
            scrapeUrl,
            scrapeMode,
            scrapeId,
            progressText,
            bookshelfUpdated,
            startDownload,
            cancelDownload,
            webViewRef,
            onWebViewMessage
        }}>
            {children}
            <DescrambleWebView ref={descrambleWebViewRef} />
        </ComicDownloadContext.Provider>
    );
};
