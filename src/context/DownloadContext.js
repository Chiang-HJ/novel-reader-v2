import React, { createContext, useContext, useState, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { debounce } from 'lodash';
import { parseChapterText, parseNovelInfo } from '../utils/scraper';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';

const DownloadContext = createContext();

export const useDownload = () => useContext(DownloadContext);

const saveQueueToStorage = debounce((q) => {
    AsyncStorage.setItem('@download_queue', JSON.stringify(q)).catch(() => {});
}, 500);

// This provider holds ONLY state and logic. No WebView rendering here.
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

    const processNextTask = (task) => {
        activeTaskRef.current = task;
        setActiveTask(task);
        setProgressText('正在初始化下載與解析目錄...');
        scrapeModeRef.current = 'info';
        setScrapeMode('info');
        cachedHtmlRef.current = null;
        let finalUrl = (task.url || '').trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https://' + finalUrl;
        }
        setScrapeUrl(finalUrl);

        if (initialFetchTimerRef.current) clearTimeout(initialFetchTimerRef.current);
        initialFetchTimerRef.current = setTimeout(() => {
            if (scrapeModeRef.current === 'info') {
                setProgressText('獲取目錄超時，跳過此任務。');
                setTimeout(() => {
                    cancelDownload(finalUrl);
                }, 2000);
            }
        }, 20000);
    };

    const fetchChapterHtmlDirect = async (url) => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh-HK;q=0.9,zh;q=0.8,en;q=0.7'
                }
            });
            clearTimeout(timeout);
            if (res.ok) {
                const text = await res.text();
                if (text && !text.includes('Just a moment...') && !text.includes('Attention Required! | Cloudflare') && text.includes('<div') && text.length > 200) {
                    return text;
                }
            }
        } catch (e) {}
        return null;
    };

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
            timerId = setTimeout(() => cleanupAndResolve(''), 15000);

            const code = `
                (function() {
                    fetch('${chapterUrl.replace(/'/g, "\\'").split('#')[0]}', {
                        credentials: 'include',
                        redirect: 'follow',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': navigator.language || 'zh-TW,zh;q=0.9,en;q=0.7',
                            'Cache-Control': 'no-cache'
                        }
                    })
                    .then(function(res) { return res.text(); })
                    .then(function(text) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ 
                            type: 'chapterHtml', 
                            requestId: '${reqId}',
                            url: '${chapterUrl.replace(/'/g, "\\'")}',
                            html: text 
                        }));
                    })
                    .catch(function(e) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ 
                            type: 'chapterHtml', 
                            requestId: '${reqId}',
                            url: '${chapterUrl.replace(/'/g, "\\'")}',
                            html: '' 
                        }));
                    });
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

    const onWebViewMessage = async (event) => {
        const dataStr = event.nativeEvent.data;
        if (!dataStr) return;

        const task = activeTaskRef.current;

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

            if (parsed.type === 'manualCaptchaPassed') {
                if (manualCaptchaResolveRef.current) {
                    manualCaptchaResolveRef.current(parsed.html || '');
                }
                return;
            }

            if (parsed.type === 'novelInfoHtml' || scrapeModeRef.current === 'info') {
                if (initialFetchTimerRef.current) clearTimeout(initialFetchTimerRef.current);
                if (downloadingNovelIdRef.current) return;
                if (parsed.error) throw new Error(parsed.error);

                const novelInfo = parseNovelInfo(parsed.html, parsed.url || task?.url);
                if (!novelInfo || !novelInfo.chapters || novelInfo.chapters.length === 0) {
                    setIsCaptchaBlocked(true);
                    setProgressText('遇到防護網或內容警告，請協助驗證...');
                    return;
                } else {
                    setIsCaptchaBlocked(false);
                    cachedHtmlRef.current = parsed.html;
                }

                downloadingNovelIdRef.current = novelInfo.id;
                setDownloadingNovelId(novelInfo.id);
                setProgressText('正在準備下載章節...');

                const existingList = await getBookshelf();
                const existing = existingList.find(n => n.id === novelInfo.id);
                
                if (task.startChapter === undefined) {
                    setProgressText('等待選擇章節...');
                    const selection = await new Promise((resolve) => {
                        setPendingSelection({ novelInfo, existing, task, resolve });
                    });
                    
                    if (!selection) {
                        setScrapeUrl(null);
                        downloadingNovelIdRef.current = null;
                        setDownloadingNovelId(null);
                        setProgressText('');
                        setActiveTask(null);
                        activeTaskRef.current = null;
                        setQueue(prev => prev.filter(q => q.url !== task?.url));
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
                    return;
                }

                // Slice the EXACT range of chapters user chose to download
                const selectedSourceChapters = novelInfo.chapters.slice(startIndex, endIndex);
                const totalToDownload = selectedSourceChapters.length;

                // Determine whether this is appending to an existing book, overwriting, or a new book
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
                    // New book: ONLY store the selected slice of chapters! No phantom out-of-range chapters!
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

                // Concurrent Worker Pool (Concurrency = 3)
                const CONCURRENCY = 3;
                let completedCount = 0;
                let workerCursor = 0;

                const downloadSingleChapter = async (index) => {
                    if (cancelFlagRef.current.has(task?.url)) return;

                    const sourceIdx = startIndex + index;
                    const localFileIdx = isAppending 
                        ? (existing.chapters.length + index) 
                        : (isOverwriting ? (startIndex + index) : index);
                    const ch = selectedSourceChapters[index];
                    const chapterUrl = ch.url;

                    let html = null;

                    // Fast check for single-page cached HTML
                    let cleanChapterUrl = chapterUrl.split('#')[0].split('?')[0];
                    let cleanScrapeUrl = (task?.url || '').split('#')[0].split('?')[0];
                    try { cleanChapterUrl = decodeURIComponent(cleanChapterUrl); } catch(e) {}
                    try { cleanScrapeUrl = decodeURIComponent(cleanScrapeUrl); } catch(e) {}

                    if (cleanChapterUrl === cleanScrapeUrl && cachedHtmlRef.current) {
                        html = cachedHtmlRef.current;
                    } else {
                        // 1. Direct HTTP fast fetch
                        html = await fetchChapterHtmlDirect(chapterUrl);
                        
                        // 2. Fallback to WebView injected fetch
                        if (!html) {
                            html = await fetchChapterHtmlViaWebView(chapterUrl);
                        }
                    }

                    if (cancelFlagRef.current.has(task?.url)) return;

                    // Micro-yield to keep TTS and UI at 60fps
                    await new Promise(r => setTimeout(r, 10));
                    let text = parseChapterText(html, chapterUrl);
                    await new Promise(r => setTimeout(r, 10));

                    // 3. If Cloudflare captcha blocked, handle manual verification
                    if (!text) {
                        if (html === '' || !html) {
                            text = '【章節下載失敗：網路連線逾時】';
                        } else {
                            setProgressText(`遇到防護網，請協助驗證 (${sourceIdx + 1}/${novelInfo.chapters.length})`);
                            scrapeModeRef.current = 'chapter';
                            setScrapeMode('chapter');
                            setScrapeUrl(chapterUrl);
                            setIsCaptchaBlocked(true);

                            const manualHtml = await new Promise((resolve) => {
                                const timer = setTimeout(() => {
                                    resolve('');
                                }, 60000);
                                manualCaptchaResolveRef.current = (h) => {
                                    clearTimeout(timer);
                                    resolve(h);
                                };
                            });

                            setIsCaptchaBlocked(false);
                            if (manualHtml) {
                                text = parseChapterText(manualHtml, chapterUrl);
                            }
                            if (!text) {
                                text = '【章節下載失敗：防護網驗證未通過】';
                            }
                        }
                    }

                    // Save chapter text directly to disk
                    await saveChapterText(novelInfo.id, localFileIdx, ch.title, text);
                    completedCount++;

                    setProgressText(`背景極速下載中... ${completedCount}/${totalToDownload}`);

                    if (completedCount % 5 === 0 || completedCount === totalToDownload) {
                        const currentDownloaded = (isAppending ? existing.chapters.length : (isOverwriting ? startIndex : 0)) + completedCount;
                        await updateNovelMetadata(novelInfo.id, { 
                            downloadedChapters: currentDownloaded,
                            chapterCount: finalChapters.length
                        });
                        setBookshelfUpdated(Date.now());
                    }
                };

                const runWorker = async () => {
                    while (workerCursor < totalToDownload) {
                        if (cancelFlagRef.current.has(task?.url)) break;
                        const currentIndex = workerCursor++;
                        await downloadSingleChapter(currentIndex);
                        // Micro yield between requests
                        await new Promise(r => setTimeout(r, 20));
                    }
                };

                const workers = Array.from(
                    { length: Math.min(CONCURRENCY, totalToDownload) }, 
                    () => runWorker()
                );
                await Promise.all(workers);

                if (cancelFlagRef.current.has(task?.url)) {
                    cancelFlagRef.current.delete(task?.url);
                    setScrapeUrl(null);
                    downloadingNovelIdRef.current = null;
                    setDownloadingNovelId(null);
                    setProgressText('');
                    setActiveTask(null);
                    activeTaskRef.current = null;
                    setQueue(prev => prev.filter(q => q.url !== task?.url));
                    return;
                }

                const finalDownloaded = (isAppending ? existing.chapters.length : (isOverwriting ? startIndex : 0)) + completedCount;
                await updateNovelMetadata(novelInfo.id, {
                    chapters: finalChapters,
                    chapterCount: finalChapters.length,
                    downloadedChapters: finalDownloaded
                });
                setBookshelfUpdated(Date.now());

                setScrapeUrl(null);
                downloadingNovelIdRef.current = null;
                setDownloadingNovelId(null);
                setProgressText('下載完成！');
                setActiveTask(null);
                activeTaskRef.current = null;
                setQueue(prev => prev.filter(q => q.url !== task?.url));
            }
        } catch (error) {
            setScrapeUrl(null);
            downloadingNovelIdRef.current = null;
            setDownloadingNovelId(null);
            setProgressText('');
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.filter(q => q.url !== task?.url));
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
        <DownloadContext.Provider value={{
            startDownload,
            cancelDownload,
            resumeDownload,
            cancelSelection,
            pendingSelection,
            isDownloading: !!downloadingNovelId || queue.length > 0,
            progressText,
            queue,
            activeTask,
            bookshelfUpdated,
            // Internal — used by DownloadWebViewHost
            scrapeUrl,
            scrapeMode,
            isCaptchaBlocked,
            webViewRef,
            onWebViewMessage,
        }}>
            {children}
        </DownloadContext.Provider>
    );
};
