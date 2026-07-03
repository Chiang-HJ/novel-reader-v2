import React, { createContext, useContext, useState, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseChapterText, parseNovelInfo } from '../utils/scraper';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';

const DownloadContext = createContext();

export const useDownload = () => useContext(DownloadContext);

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

    const webViewRef = useRef(null);
    const chapterHtmlResolveRef = useRef(null);
    const cancelFlagRef = useRef(new Set());
    const activeTaskRef = useRef(null);

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
        AsyncStorage.setItem('@download_queue', JSON.stringify(queue)).catch(() => {});
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
        if (!queue.find(q => q.url === trimmedUrl) && (!activeTaskRef.current || activeTaskRef.current.url !== trimmedUrl)) {
            setQueue(prev => [...prev, { url: trimmedUrl, addedAt: Date.now() }]);
            cancelFlagRef.current.delete(trimmedUrl);
        }
    };

    const cancelDownload = (url) => {
        setQueue(prev => prev.filter(q => q.url !== url));
        cancelFlagRef.current.add(url);
        if (activeTaskRef.current && activeTaskRef.current.url === url) {
            setScrapeUrl(null);
            if (chapterHtmlResolveRef.current) {
                chapterHtmlResolveRef.current('');
            }
            setIsCaptchaBlocked(false);
            setDownloadingNovelId(null);
            setActiveTask(null);
            activeTaskRef.current = null;
            setProgressText('');
        }
    };

    const processNextTask = (task) => {
        activeTaskRef.current = task;
        setActiveTask(task);
        setProgressText('正在通過 Cloudflare 驗證...');
        setScrapeMode('info');
        let finalUrl = (task.url || '').trim();
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https://' + finalUrl;
        }
        setScrapeUrl(finalUrl);
    };

    const onWebViewMessage = async (event) => {
        const dataStr = event.nativeEvent.data;
        if (!dataStr) return;

        const task = activeTaskRef.current;

        try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'chapterHtml') {
                if (chapterHtmlResolveRef.current) {
                    chapterHtmlResolveRef.current(parsed.html || '');
                }
                return;
            }

            if (parsed.type === 'novelInfoHtml' || scrapeMode === 'info') {
                if (downloadingNovelId) return;
                if (parsed.error) throw new Error(parsed.error);

                const novelInfo = parseNovelInfo(parsed.html, parsed.url || task?.url);
                if (!novelInfo || !novelInfo.chapters || novelInfo.chapters.length === 0) {
                    throw new Error('找不到章節 (網址無效、解析失敗或被阻擋)');
                }

                setDownloadingNovelId(novelInfo.id);
                setProgressText('正在準備下載章節...');

                const existingList = await getBookshelf();
                const existing = existingList.find(n => n.id === novelInfo.id);
                let startIndex = existing?.downloadedChapters || 0;

                if (startIndex >= novelInfo.chapters.length) {
                    setScrapeUrl(null);
                    setDownloadingNovelId(null);
                    setProgressText('已下載完畢');
                    setActiveTask(null);
                    activeTaskRef.current = null;
                    setQueue(prev => prev.filter(q => q.url !== task?.url));
                    return;
                }

                await saveNovelToBookshelf({ ...novelInfo, chapterCount: novelInfo.chapters.length, downloadedChapters: startIndex });
                setBookshelfUpdated(Date.now());

                for (let i = startIndex; i < novelInfo.chapters.length; i++) {
                    if (cancelFlagRef.current.has(task?.url)) {
                        cancelFlagRef.current.delete(task?.url);
                        setScrapeUrl(null);
                        setDownloadingNovelId(null);
                        setProgressText('');
                        setActiveTask(null);
                        activeTaskRef.current = null;
                        setQueue(prev => prev.filter(q => q.url !== task?.url));
                        return;
                    }

                    setProgressText(`背景下載中... ${i + 1}/${novelInfo.chapters.length}`);
                    const chapterUrl = novelInfo.chapters[i].url;

                    const html = await new Promise((resolve) => {
                        chapterHtmlResolveRef.current = resolve;
                        const code = `
                            (function() {
                                var iframe = document.createElement('iframe');
                                iframe.style.cssText = 'display:none;position:absolute;width:1px;height:1px;';
                                iframe.src = '${chapterUrl.replace(/'/g, "\\'")}';
                                iframe.onload = function() {
                                    try {
                                        var h = iframe.contentWindow.document.body.innerHTML;
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: h }));
                                    } catch(e) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: '' }));
                                    }
                                    document.body.removeChild(iframe);
                                };
                                iframe.onerror = function() {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: '' }));
                                    document.body.removeChild(iframe);
                                };
                                document.body.appendChild(iframe);
                            })();
                            true;
                        `;
                        if (webViewRef.current) {
                            webViewRef.current.injectJavaScript(code);
                        } else {
                            resolve('');
                        }
                        setTimeout(() => resolve(''), 15000);
                    });

                    if (cancelFlagRef.current.has(task?.url)) {
                        cancelFlagRef.current.delete(task?.url);
                        setScrapeUrl(null);
                        setDownloadingNovelId(null);
                        setProgressText('');
                        setActiveTask(null);
                        activeTaskRef.current = null;
                        setQueue(prev => prev.filter(q => q.url !== task?.url));
                        return;
                    }

                    let text = parseChapterText(html, chapterUrl);

                    if (!text) {
                        setProgressText(`遇到防護網，請協助驗證 (${i + 1}/${novelInfo.chapters.length})`);
                        setScrapeMode('chapter');
                        setScrapeUrl(chapterUrl);
                        setIsCaptchaBlocked(true);

                        const manualHtml = await new Promise((resolve) => {
                            chapterHtmlResolveRef.current = resolve;
                        });

                        if (cancelFlagRef.current.has(task?.url)) {
                            cancelFlagRef.current.delete(task?.url);
                            setScrapeUrl(null);
                            setDownloadingNovelId(null);
                            setProgressText('');
                            setActiveTask(null);
                            activeTaskRef.current = null;
                            setIsCaptchaBlocked(false);
                            setQueue(prev => prev.filter(q => q.url !== task?.url));
                            return;
                        }

                        text = parseChapterText(manualHtml, chapterUrl);
                        setIsCaptchaBlocked(false);
                        setScrapeMode('info');
                        setScrapeUrl(novelInfo.url);
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    await saveChapterText(novelInfo.id, i, novelInfo.chapters[i].title, text);

                    if (i === 4 || (i + 1) % 10 === 0 || i === novelInfo.chapters.length - 1) {
                        await saveNovelToBookshelf({ ...novelInfo, chapterCount: novelInfo.chapters.length, downloadedChapters: i + 1 });
                        setBookshelfUpdated(Date.now());
                    }

                    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 1000));
                }

                await saveNovelToBookshelf({ ...novelInfo, chapterCount: novelInfo.chapters.length, downloadedChapters: novelInfo.chapters.length });
                setScrapeUrl(null);
                setDownloadingNovelId(null);
                setProgressText('下載完成！');
                setActiveTask(null);
                activeTaskRef.current = null;
                setQueue(prev => prev.filter(q => q.url !== task?.url));
            }
        } catch (error) {
            console.error('Download error:', error);
            setScrapeUrl(null);
            setDownloadingNovelId(null);
            setProgressText('');
            setActiveTask(null);
            activeTaskRef.current = null;
            setQueue(prev => prev.filter(q => q.url !== task?.url));
        }
    };

    return (
        <DownloadContext.Provider value={{
            startDownload,
            cancelDownload,
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
