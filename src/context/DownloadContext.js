import React, { createContext, useContext, useState, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { debounce } from 'lodash';
import { parseChapterText, parseNovelInfo } from '../utils/scraper';
import { saveNovelToBookshelf, saveChapterText, getBookshelf, updateNovelMetadata, getNovelMetadata } from '../utils/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { parseEpub } from '../utils/epubParser';
import { convertS2T } from '../utils/opencc';
import { startBackgroundKeepAlive, stopBackgroundKeepAlive } from '../utils/backgroundKeepAlive';

const DownloadContext = createContext();

export const useDownload = () => useContext(DownloadContext);

const saveQueueToStorage = debounce((q) => {
    AsyncStorage.setItem('@download_queue', JSON.stringify(q)).catch(() => {});
}, 500);

const isBlockedOrJunk = (text, rawHtml) => {
    if (!text || text.trim().length === 0) return true;
    const lower = ((rawHtml || '') + ' ' + text).toLowerCase();
    if (
        lower.includes('enable javascript and cookies to continue') ||
        lower.includes('just a moment...') ||
        lower.includes('attention required! | cloudflare') ||
        lower.includes('cf-browser-verification') ||
        lower.includes('challenge-running') ||
        lower.includes('ray id:') ||
        lower.includes('turnstile') ||
        lower.includes('verify you are human') ||
        text.includes('小說標籤功能上線') ||
        text.includes('替小說新增標籤喔')
    ) {
        return true;
    }
    return false;
};

export const DownloadProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);
    const [activeTask, setActiveTask] = useState(null);
    const [scrapeUrl, setScrapeUrl] = useState(null);
    const [scrapeMode, setScrapeMode] = useState(null);
    const [isCaptchaBlocked, setIsCaptchaBlocked] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [downloadingNovelId, setDownloadingNovelId] = useState(null);
    const [bookshelfUpdated, setBookshelfUpdated] = useState(Date.now());
    
    // For custom chapter selection
    const [pendingSelection, setPendingSelection] = useState(null);

    const webViewRef = useRef(null);
    const pendingRequestsRef = useRef(new Map());
    const manualCaptchaResolveRef = useRef(null);
    const cancelFlagRef = useRef(new Set());
    const activeTaskRef = useRef(null);
    const downloadingNovelIdRef = useRef(null);
    const scrapeModeRef = useRef(null);
    const initialFetchTimerRef = useRef(null);
    const cachedHtmlRef = useRef(null);
    const domainSessionModeRef = useRef(new Map()); // domain -> 'webview' | 'direct'

    React.useEffect(() => {
        const loadQueue = async () => {
            try {
                const saved = await AsyncStorage.getItem('@download_queue');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        setQueue(parsed.filter(q => q && typeof q.url === 'string'));
                    }
                }
            } catch (e) {}
        };
        loadQueue();
    }, []);

    React.useEffect(() => {
        saveQueueToStorage(queue);
        if (queue.length > 0 && !activeTaskRef.current && !downloadingNovelId) {
            processNextTask(queue[0]);
        }
    }, [queue, downloadingNovelId]);

    const startDownload = (url) => {
        if (!url || typeof url !== 'string' || !url.trim()) {
            Alert.alert('無效的網址', '請輸入有效的小說網址！');
            return;
        }
        const trimmedUrl = url.trim();
        setQueue(prevQueue => {
            if (prevQueue.find(q => q.url === trimmedUrl)) return prevQueue;
            if (activeTaskRef.current && activeTaskRef.current.url === trimmedUrl) return prevQueue;
            cancelFlagRef.current.delete(trimmedUrl);
            return [...prevQueue, { url: trimmedUrl, addedAt: Date.now() }];
        });
    };

    const cancelDownload = (url) => {
        setQueue(prev => prev.filter(q => q.url !== url));
        cancelFlagRef.current.add(url);
        stopBackgroundKeepAlive('novel_download');
        if (initialFetchTimerRef.current) {
            clearTimeout(initialFetchTimerRef.current);
            initialFetchTimerRef.current = null;
        }
        if (activeTaskRef.current && activeTaskRef.current.url === url) {
            setScrapeUrl(null);
            pendingRequestsRef.current.forEach(resolve => resolve(''));
            pendingRequestsRef.current.clear();
            if (manualCaptchaResolveRef.current) {
                manualCaptchaResolveRef.current('');
            }
            setIsCaptchaBlocked(false);
            downloadingNovelIdRef.current = null;
            setDownloadingNovelId(null);
            setActiveTask(null);
            activeTaskRef.current = null;
            setProgressText('');
            cachedHtmlRef.current = null;
        }
    };

    const getDomain = (url) => {
        try {
            const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
            return matches && matches[1] ? matches[1].toLowerCase() : '';
        } catch (e) {
            return '';
        }
    };

    const fetchChapterHtmlDirect = async (url) => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh-HK;q=0.9,zh;q=0.8,en;q=0.7',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none'
                }
            });
            clearTimeout(timeout);
            if (res.ok) {
                const text = await res.text();
                const lower = text.toLowerCase();
                if (
                    text && 
                    text.length > 200 &&
                    !lower.includes('enable javascript and cookies to continue') &&
                    !lower.includes('just a moment...') &&
                    !lower.includes('attention required! | cloudflare') &&
                    !lower.includes('challenge-running') &&
                    !lower.includes('turnstile') &&
                    (text.includes('<div') || text.includes('<body'))
                ) {
                    return text;
                }
            }
        } catch (e) {}
        return null;
    };

    /**
     * Executes in-page XMLHttpRequest within the verified WebView session.
     */
    const fetchChapterHtmlViaWebView = async (chapterUrl) => {
        const reqId = 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
        return new Promise((resolve) => {
            let timerId;
            const cleanupAndResolve = (val) => {
                clearTimeout(timerId);
                pendingRequestsRef.current.delete(reqId);
                resolve(val);
            };
            pendingRequestsRef.current.set(reqId, cleanupAndResolve);
            timerId = setTimeout(() => cleanupAndResolve(''), 8000);

            const cleanTargetUrl = chapterUrl.replace(/'/g, "\\'").split('#')[0];
            const code = `
                (function() {
                    function doFetch() {
                        try {
                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', '${cleanTargetUrl}', true);
                            xhr.withCredentials = true;
                            xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
                            xhr.timeout = 7000;
                            xhr.onload = function() {
                                if (xhr.status >= 200 && xhr.status < 300) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                        type: 'chapterHtml', 
                                        requestId: '${reqId}',
                                        url: '${cleanTargetUrl}',
                                        html: xhr.responseText 
                                    }));
                                } else {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                        type: 'chapterHtml', 
                                        requestId: '${reqId}',
                                        url: '${cleanTargetUrl}',
                                        html: '' 
                                    }));
                                }
                            };
                            xhr.onerror = xhr.ontimeout = function() {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                    type: 'chapterHtml', 
                                    requestId: '${reqId}',
                                    url: '${cleanTargetUrl}',
                                    html: '' 
                                }));
                            };
                            xhr.send();
                        } catch(e) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'chapterHtml', 
                                requestId: '${reqId}',
                                url: '${cleanTargetUrl}',
                                html: '' 
                            }));
                        }
                    }
                    doFetch();
                })();
                true;
            `;
            if (webViewRef.current) {
                webViewRef.current.injectJavaScript(code);
            } else {
                cleanupAndResolve('');
            }
        });
    };

    const handleDirectFileDownload = async (finalUrl, task) => {
        try {
            const lower = finalUrl.toLowerCase().split('?')[0];
            const isEpub = lower.endsWith('.epub');
            const isTxt = lower.endsWith('.txt');

            if (!isEpub && !isTxt) return false;

            setProgressText('正在下載檔案...');
            
            let filename = 'download_' + Date.now() + (isEpub ? '.epub' : '.txt');
            try {
                const urlParts = finalUrl.split('?')[0].split('/');
                const candidate = decodeURIComponent(urlParts[urlParts.length - 1]);
                if (candidate && candidate.length > 4) {
                    filename = candidate;
                }
            } catch(e) {}

            const localUri = FileSystem.cacheDirectory + filename;
            const downloadRes = await FileSystem.downloadAsync(finalUrl, localUri);
            
            if (isEpub) {
                setProgressText('正在解析 EPUB 書籍內容...');
                const parsed = await parseEpub(downloadRes.uri);
                const novelId = 'novel_epub_' + Date.now();
                
                for (let i = 0; i < parsed.chapters.length; i++) {
                    await saveChapterText(novelId, i, parsed.chapters[i].title, parsed.chapters[i].text);
                }
                
                const novelInfo = {
                    id: novelId,
                    title: parsed.title || filename.replace('.epub', ''),
                    author: parsed.author || '未知作者',
                    cover: '',
                    url: finalUrl,
                    chapters: parsed.chapters.map((c, i) => ({ title: c.title, url: `local_${i}` })),
                    chapterCount: parsed.chapters.length,
                    downloadedChapters: parsed.chapters.length,
                };
                
                await saveNovelToBookshelf(novelInfo);
                setBookshelfUpdated(Date.now());
                setProgressText(`🎉 《${novelInfo.title}》EPUB 匯入完成！`);
            } else if (isTxt) {
                setProgressText('正在解析 TXT 文本並切分章節...');
                const rawText = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: 'utf8' });
                const title = filename.replace('.txt', '');
                const novelId = 'novel_txt_' + Date.now();

                const textData = convertS2T(rawText);
                const regex = new RegExp(`(第[零一二三四五六七八九十百千0-9]+[章節][^\\n]*)`, 'g');
                const parts = textData.split(regex);

                let chapters = [];
                let chapterIndex = 0;

                if (parts.length > 1) {
                    if (parts[0].trim().length > 0) {
                        chapters.push({ title: '前言/簡介', url: 'manual_' + chapterIndex });
                        await saveChapterText(novelId, chapterIndex, '前言/簡介', parts[0].trim());
                        chapterIndex++;
                    }
                    for (let i = 1; i < parts.length; i += 2) {
                        const chTitle = parts[i].trim();
                        const textContent = parts[i + 1] ? parts[i + 1].trim() : '';
                        if (textContent.length === 0) continue;

                        chapters.push({ title: chTitle, url: 'manual_' + chapterIndex });
                        await saveChapterText(novelId, chapterIndex, chTitle, textContent);
                        chapterIndex++;
                    }
                } else {
                    const lines = textData.trim().split('\n');
                    const MAX_CHARS = 10000;
                    let currentChunkLines = [];
                    let currentLength = 0;

                    for (let i = 0; i < lines.length; i++) {
                        currentChunkLines.push(lines[i]);
                        currentLength += lines[i].length + 1;
                        if (currentLength > MAX_CHARS) {
                            const chTitle = `第 ${chapterIndex + 1} 部分`;
                            const chunkText = currentChunkLines.join('\n');
                            chapters.push({ title: chTitle, url: 'manual_' + chapterIndex });
                            await saveChapterText(novelId, chapterIndex, chTitle, chunkText);
                            chapterIndex++;
                            currentChunkLines = [];
                            currentLength = 0;
                        }
                    }
                    if (currentChunkLines.length > 0) {
                        const chTitle = `第 ${chapterIndex + 1} 部分`;
                        chapters.push({ title: chTitle, url: 'manual_' + chapterIndex });
                        await saveChapterText(novelId, chapterIndex, chTitle, currentChunkLines.join('\n'));
                    }
                }

                const novelInfo = {
                    id: novelId,
                    title: title.trim(),
                    author: '本地匯入',
                    cover: '',
                    url: finalUrl,
                    chapters,
                    chapterCount: chapters.length,
                    downloadedChapters: chapters.length,
                };

                await saveNovelToBookshelf(novelInfo);
                setBookshelfUpdated(Date.now());
                setProgressText(`🎉 《${novelInfo.title}》TXT 匯入完成！共 ${chapters.length} 章`);
            }

            setTimeout(() => {
                setActiveTask(null);
                activeTaskRef.current = null;
                setProgressText('');
                setQueue(prev => prev.filter(q => q.url !== task?.url));
                stopBackgroundKeepAlive('novel_download');
            }, 1500);

            return true;
        } catch(e) {
            stopBackgroundKeepAlive('novel_download');
            return false;
        }
    };

    const processNextTask = async (task) => {
        startBackgroundKeepAlive('novel_download');
        activeTaskRef.current = task;
        setActiveTask(task);
        downloadingNovelIdRef.current = null;
        setDownloadingNovelId(null);
        scrapeModeRef.current = 'info';
        setScrapeMode('info');
        cachedHtmlRef.current = null;
        
        let finalUrl = (task.url || '').trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https://' + finalUrl;
        }

        // Direct file URL check (.epub or .txt)
        const handledDirectFile = await handleDirectFileDownload(finalUrl, task);
        if (handledDirectFile) return;

        const domain = getDomain(finalUrl);
        setProgressText('正在連線取得小說目錄...');

        // 1. Check if domain is known to require WebView session (e.g. czbooks)
        const isKnownProtected = domainSessionModeRef.current.get(domain) === 'webview' || domain.includes('czbooks.net');

        if (!isKnownProtected) {
            try {
                const directHtml = await fetchChapterHtmlDirect(finalUrl);
                if (directHtml) {
                    const novelInfo = parseNovelInfo(directHtml, finalUrl);
                    if (novelInfo && novelInfo.chapters && novelInfo.chapters.length > 0) {
                        domainSessionModeRef.current.set(domain, 'direct');
                        cachedHtmlRef.current = directHtml;
                        await handleNovelInfoReady(novelInfo, task);
                        return;
                    }
                }
            } catch (e) {}
        }

        // 2. Protected site / Direct fetch failed -> Warm up WebView session
        domainSessionModeRef.current.set(domain, 'webview');
        setProgressText('正在透過背景瀏覽器載入小說目錄...');
        setScrapeUrl(finalUrl);

        if (initialFetchTimerRef.current) clearTimeout(initialFetchTimerRef.current);
        initialFetchTimerRef.current = setTimeout(() => {
            if (scrapeModeRef.current === 'info') {
                setProgressText('獲取目錄超時，請確認網址或網路連線。');
                setTimeout(() => {
                    cancelDownload(finalUrl);
                }, 3000);
            }
        }, 30000);
    };

    const handleNovelInfoReady = async (novelInfo, task) => {
        if (initialFetchTimerRef.current) clearTimeout(initialFetchTimerRef.current);
        if (downloadingNovelIdRef.current) return;

        downloadingNovelIdRef.current = novelInfo.id;
        setDownloadingNovelId(novelInfo.id);
        setIsCaptchaBlocked(false);

        setProgressText(`已取得《${novelInfo.title}》目錄，共 ${novelInfo.chapters.length} 章，準備下載...`);

        const existingFull = await getNovelMetadata(novelInfo.id);
        const existingList = await getBookshelf();
        const existing = existingFull || existingList.find(n => n.id === novelInfo.id);
        
        if (task.startChapter === undefined) {
            setProgressText(`請選擇《${novelInfo.title}》的下載章節範圍...`);
            const selection = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    resolve({ start: 0, end: novelInfo.chapters.length });
                }, 90000);
                setPendingSelection({
                    novelInfo,
                    existing,
                    task,
                    resolve: (val) => {
                        clearTimeout(timer);
                        resolve(val);
                    }
                });
            });
            
            if (!selection) {
                setScrapeUrl(null);
                downloadingNovelIdRef.current = null;
                setDownloadingNovelId(null);
                setProgressText('');
                setActiveTask(null);
                activeTaskRef.current = null;
                setQueue(prev => prev.filter(q => q.url !== task?.url));
                stopBackgroundKeepAlive('novel_download');
                return;
            }
            
            task.startChapter = selection.start;
            task.endChapter = selection.end;
        }

        let startIndex = task.startChapter;
        let endIndex = task.endChapter;

        if (startIndex >= endIndex || startIndex < 0 || endIndex > novelInfo.chapters.length) {
            setScrapeUrl(null);
            downloadingNovelIdRef.current = null;
            setDownloadingNovelId(null);
            setProgressText('無需要下載的章節');
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.filter(q => q.url !== task?.url));
            stopBackgroundKeepAlive('novel_download');
            return;
        }

        const selectedSourceChapters = novelInfo.chapters.slice(startIndex, endIndex);
        const totalToDownload = selectedSourceChapters.length;

        let finalChapters = [];
        let isAppending = false;
        let isOverwriting = false;

        if (existing && existing.chapters && existing.chapters.length > 0) {
            if (startIndex >= existing.chapters.length) {
                isAppending = true;
                finalChapters = [...existing.chapters, ...selectedSourceChapters];
            } else {
                isOverwriting = true;
                finalChapters = [...existing.chapters];
                for (let k = 0; k < selectedSourceChapters.length; k++) {
                    finalChapters[startIndex + k] = selectedSourceChapters[k];
                }
            }
        } else {
            finalChapters = selectedSourceChapters;
        }

        const initialDownloadedCount = isAppending 
            ? existing.chapters.length 
            : (isOverwriting ? (existing.downloadedChapters || 0) : 0);

        await saveNovelToBookshelf({
            ...novelInfo,
            chapters: finalChapters,
            chapterCount: finalChapters.length,
            downloadedChapters: initialDownloadedCount
        });
        setBookshelfUpdated(Date.now());

        const domain = getDomain(task.url);
        const isSessionMode = domainSessionModeRef.current.get(domain) === 'webview' || domain.includes('czbooks.net');

        let completedCount = 0;

        for (let i = 0; i < totalToDownload; i++) {
            if (cancelFlagRef.current.has(task?.url)) break;

            const localFileIdx = isAppending 
                ? (existing.chapters.length + i) 
                : (isOverwriting ? (startIndex + i) : i);
            const ch = selectedSourceChapters[i];
            const chapterUrl = ch.url;

            let html = null;
            let text = '';

            setProgressText(`[第 ${i + 1}/${totalToDownload} 章] 正在下載: ${ch.title}`);

            // Fast check for single-page cached HTML
            let cleanChapterUrl = chapterUrl.split('#')[0].split('?')[0];
            let cleanScrapeUrl = (task?.url || '').split('#')[0].split('?')[0];
            try { cleanChapterUrl = decodeURIComponent(cleanChapterUrl); } catch(e) {}
            try { cleanScrapeUrl = decodeURIComponent(cleanScrapeUrl); } catch(e) {}

            if (cleanChapterUrl === cleanScrapeUrl && cachedHtmlRef.current) {
                html = cachedHtmlRef.current;
                const parsed = parseChapterText(html, chapterUrl);
                if (!isBlockedOrJunk(parsed, html)) {
                    text = parsed;
                }
            }

            // Strategy A: If domain is NOT protected, try Direct HTTP fast fetch
            if (!text && !isSessionMode) {
                html = await fetchChapterHtmlDirect(chapterUrl);
                if (html) {
                    const parsed = parseChapterText(html, chapterUrl);
                    if (!isBlockedOrJunk(parsed, html)) {
                        text = parsed;
                    }
                } else {
                    domainSessionModeRef.current.set(domain, 'webview');
                }
            }

            // Strategy B: In-page WebView fetch (uses cf_clearance session cookies, NO CAPTCHA triggers)
            if (!text) {
                html = await fetchChapterHtmlViaWebView(chapterUrl);
                if (html) {
                    const parsed = parseChapterText(html, chapterUrl);
                    if (!isBlockedOrJunk(parsed, html)) {
                        text = parsed;
                    }
                }
                // Quick retry once with short 800ms cooldown if first attempt missed
                if (!text) {
                    await new Promise(r => setTimeout(r, 800));
                    html = await fetchChapterHtmlViaWebView(chapterUrl);
                    if (html) {
                        const parsed = parseChapterText(html, chapterUrl);
                        if (!isBlockedOrJunk(parsed, html)) {
                            text = parsed;
                        }
                    }
                }
            }

            // Strategy C: Rare fallback to full WebView navigation only if session completely expired
            if (!text) {
                scrapeModeRef.current = 'chapter';
                setScrapeMode('chapter');
                setScrapeUrl(chapterUrl);

                const navHtml = await new Promise((resolve) => {
                    const timer = setTimeout(() => resolve(''), 30000);
                    manualCaptchaResolveRef.current = (h, reportedUrl) => {
                        // Ensure the reported HTML is actually from the requested chapter URL
                        if (reportedUrl && chapterUrl) {
                            const cleanReported = reportedUrl.split('?')[0].split('#')[0].toLowerCase();
                            const cleanTarget = chapterUrl.split('?')[0].split('#')[0].toLowerCase();
                            if (!cleanReported.includes(cleanTarget) && !cleanTarget.includes(cleanReported)) {
                                return; // Ignore stale page events from previous chapter
                            }
                        }
                        clearTimeout(timer);
                        manualCaptchaResolveRef.current = null;
                        resolve(h);
                    };
                });

                setIsCaptchaBlocked(false);
                if (navHtml) {
                    const parsed = parseChapterText(navHtml, chapterUrl);
                    if (!isBlockedOrJunk(parsed, navHtml)) {
                        text = parsed;
                    }
                }
            }

            if (cancelFlagRef.current.has(task?.url)) break;

            if (!text || isBlockedOrJunk(text, '')) {
                text = '【章節下載失敗：網路連線逾時】';
            }

            // Save chapter text directly to disk
            await saveChapterText(novelInfo.id, localFileIdx, ch.title, text);
            completedCount++;

            setProgressText(`下載進度: ${completedCount}/${totalToDownload} 章 (${ch.title})`);

            if (completedCount % 5 === 0 || completedCount === totalToDownload) {
                let currentDownloaded = (isAppending ? existing.chapters.length : (isOverwriting ? startIndex : 0)) + completedCount;
                if (isOverwriting && initialDownloadedCount > currentDownloaded) {
                    currentDownloaded = initialDownloadedCount;
                }
                // Cap at finalChapters.length just in case
                if (currentDownloaded > finalChapters.length) {
                    currentDownloaded = finalChapters.length;
                }
                
                await updateNovelMetadata(novelInfo.id, { 
                    downloadedChapters: currentDownloaded,
                    chapterCount: finalChapters.length
                });
                setBookshelfUpdated(Date.now());
            }

            // Smart rate-limit protection: 750ms pacing + gentle breather every 6 chapters
            const baseDelay = 750;
            const extraRest = (i % 6 === 5) ? 600 : 0;
            await new Promise(r => setTimeout(r, baseDelay + extraRest));
        }

        if (cancelFlagRef.current.has(task?.url)) {
            cancelFlagRef.current.delete(task?.url);
            setScrapeUrl(null);
            downloadingNovelIdRef.current = null;
            setDownloadingNovelId(null);
            setProgressText('');
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.filter(q => q.url !== task?.url));
            stopBackgroundKeepAlive('novel_download');
            return;
        }

        let finalDownloaded = (isAppending ? existing.chapters.length : (isOverwriting ? startIndex : 0)) + completedCount;
        if (isOverwriting && initialDownloadedCount > finalDownloaded) {
            finalDownloaded = initialDownloadedCount;
        }
        if (finalDownloaded > finalChapters.length) {
            finalDownloaded = finalChapters.length;
        }
        await updateNovelMetadata(novelInfo.id, {
            chapters: finalChapters,
            chapterCount: finalChapters.length,
            downloadedChapters: finalDownloaded
        });
        setBookshelfUpdated(Date.now());

        setScrapeUrl(null);
        downloadingNovelIdRef.current = null;
        setDownloadingNovelId(null);
        setProgressText(`🎉 下載完成！共下載 ${completedCount} 個章節`);
        setActiveTask(null);
        activeTaskRef.current = null;
        setQueue(prev => prev.filter(q => q.url !== task?.url));
        stopBackgroundKeepAlive('novel_download');
    };

    const onWebViewMessage = async (event) => {
        const dataStr = event.nativeEvent.data;
        if (!dataStr) return;

        try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'chapterHtml') {
                if (parsed.requestId && pendingRequestsRef.current.has(parsed.requestId)) {
                    const resolve = pendingRequestsRef.current.get(parsed.requestId);
                    pendingRequestsRef.current.delete(parsed.requestId);
                    resolve(parsed.html || '');
                }
                return;
            }

            // Background challenge auto-resolving: don't show intrusive modal
            if (parsed.type === 'challengeWaiting') {
                setProgressText('正在通過安全檢測 (背景自動驗證中)...');
                return;
            }

            // Interactive captcha requiring user click (only triggered after 4.5s un-resolved)
            if (parsed.type === 'captchaBlocked') {
                setIsCaptchaBlocked(true);
                setProgressText('⚠️ 遇到安全驗證，請在下方點擊完成驗證...');
                return;
            }

            if (parsed.type === 'pageLoaded') {
                setIsCaptchaBlocked(false);

                if (manualCaptchaResolveRef.current) {
                    manualCaptchaResolveRef.current(parsed.html || '', parsed.url);
                }

                if (scrapeModeRef.current === 'info' && !downloadingNovelIdRef.current) {
                    const task = activeTaskRef.current;
                    if (!task) return;

                    const novelInfo = parseNovelInfo(parsed.html, parsed.url || task.url);
                    if (!novelInfo || !novelInfo.chapters || novelInfo.chapters.length === 0) {
                        return;
                    }

                    cachedHtmlRef.current = parsed.html;
                    await handleNovelInfoReady(novelInfo, task);
                }
            }
        } catch (error) {
            // Silently handle json parse errors
        }
    };

    const resumeDownload = (start, end) => {
        if (pendingSelection?.resolve) {
            pendingSelection.resolve({ start, end });
            setPendingSelection(null);
        }
    };

    const cancelSelection = () => {
        if (pendingSelection?.resolve) {
            pendingSelection.resolve(null);
            setPendingSelection(null);
        }
    };

    return (
        <DownloadContext.Provider
            value={{
                queue,
                activeTask,
                scrapeUrl,
                setScrapeUrl,
                scrapeMode,
                setScrapeMode,
                isCaptchaBlocked,
                setIsCaptchaBlocked,
                progressText,
                downloadingNovelId,
                bookshelfUpdated,
                webViewRef,
                startDownload,
                cancelDownload,
                onWebViewMessage,
                pendingSelection,
                resumeDownload,
                cancelSelection,
            }}
        >
            {children}
        </DownloadContext.Provider>
    );
};
