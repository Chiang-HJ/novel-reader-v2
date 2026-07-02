import React, { createContext, useContext, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { fetchChapterText, parseChapterText } from '../utils/scraper';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';
import { useTheme } from './ThemeContext';

const DownloadContext = createContext();

export const useDownload = () => useContext(DownloadContext);

export const DownloadProvider = ({ children }) => {
    const { colors } = useTheme();
    const [scrapeUrl, setScrapeUrl] = useState(null);
    const [scrapeMode, setScrapeMode] = useState(null); // 'info' or 'chapters'
    const [isCaptchaBlocked, setIsCaptchaBlocked] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [downloadingNovelId, setDownloadingNovelId] = useState(null);
    
    const webViewRef = useRef(null);
    const chapterHtmlResolveRef = useRef(null);
    const onReadyToReadRef = useRef(null);

    const startDownload = async (url, onReadyToRead) => {
        onReadyToReadRef.current = onReadyToRead;
        setProgressText('正在通過 Cloudflare 驗證...');
        setScrapeMode('info');
        setScrapeUrl(url);
    };

    const onWebViewMessage = async (event) => {
        const dataStr = event.nativeEvent.data;
        if (!dataStr) return;

        try {
            if (scrapeMode === 'info') {
                const parsed = JSON.parse(dataStr);
                
                if (parsed.type === 'chapterHtml') {
                    if (chapterHtmlResolveRef.current) {
                        chapterHtmlResolveRef.current(parsed.html);
                    }
                    return;
                }
                
                const novelInfo = parsed;
                if (novelInfo.error) throw new Error(novelInfo.error);
                if (!novelInfo.chapters || novelInfo.chapters.length === 0) throw new Error('找不到章節');
                
                setDownloadingNovelId(novelInfo.id);
                setProgressText('正在準備下載章節...');
                
                let readyFired = false;
                
                for (let i = 0; i < novelInfo.chapters.length; i++) {
                    setProgressText(`背景下載中... ${i+1}/${novelInfo.chapters.length}`);
                    const chapterUrl = novelInfo.chapters[i].url;
                    
                    const html = await new Promise((resolve) => {
                        chapterHtmlResolveRef.current = resolve;
                        const code = `
                            var iframe = document.createElement('iframe');
                            iframe.style.display = 'none';
                            iframe.src = '${chapterUrl}';
                            iframe.onload = function() {
                                try {
                                    var html = iframe.contentWindow.document.body.innerHTML;
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: html }));
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
                            true;
                        `;
                        webViewRef.current.injectJavaScript(code);
                        setTimeout(() => resolve(''), 15000);
                    });
                    
                    let text = parseChapterText(html);
                    
                    if (!text) {
                        setProgressText(`遇到防護網攔截，請協助驗證 (${i+1}/${novelInfo.chapters.length})`);
                        setScrapeUrl(chapterUrl);
                        setIsCaptchaBlocked(true);
                        
                        const manualHtml = await new Promise((resolve) => {
                            chapterHtmlResolveRef.current = resolve;
                        });
                        
                        text = parseChapterText(manualHtml);
                        setIsCaptchaBlocked(false);
                        setScrapeUrl(novelInfo.url); 
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    
                    await saveChapterText(novelInfo.id, i, novelInfo.chapters[i].title, text);
                    
                    if (i === 4 && !readyFired && onReadyToReadRef.current) {
                        readyFired = true;
                        await saveNovelToBookshelf({...novelInfo, chapterCount: novelInfo.chapters.length});
                        onReadyToReadRef.current(novelInfo);
                    }
                    
                    const delay = Math.floor(Math.random() * 1500) + 1000;
                    await new Promise(r => setTimeout(r, delay));
                }
                
                await saveNovelToBookshelf({...novelInfo, chapterCount: novelInfo.chapters.length});
                setScrapeUrl(null);
                setDownloadingNovelId(null);
                setProgressText('');
                
                if (!readyFired && onReadyToReadRef.current) {
                    onReadyToReadRef.current(novelInfo);
                }
            }
        } catch (error) {
            console.error('Download error:', error);
            setScrapeUrl(null);
            setDownloadingNovelId(null);
            setProgressText('');
        }
    };

    const isWebViewVisible = isCaptchaBlocked || (scrapeUrl && !downloadingNovelId);

    return (
        <DownloadContext.Provider value={{ startDownload, isDownloading: !!downloadingNovelId, progressText }}>
            {children}
            
            {scrapeUrl && (
                <View style={[styles.overlay, !isWebViewVisible && styles.hiddenOverlay]}>
                    <View style={[styles.webviewContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
                        {isWebViewVisible && (
                            <Text style={[styles.webviewTip, { backgroundColor: colors.surface, color: colors.text }]}>
                                {isCaptchaBlocked ? '防護網啟動中，請先勾選「我不是機器人」以繼續背景下載' : '請稍候，或根據畫面指示勾選「我不是機器人」'}
                            </Text>
                        )}
                        <WebView 
                            ref={webViewRef}
                            source={{ uri: scrapeUrl }} 
                            injectedJavaScript={`
                                var checkInterval = setInterval(function() {
                                    var title = document.title || '';
                                    if (title.indexOf('Just a moment') === -1 && title.indexOf('Cloudflare') === -1 && title.indexOf('Attention Required') === -1) {
                                        clearInterval(checkInterval);
                                        try {
                                            if (window.location.href.indexOf('_') !== -1) {
                                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'chapterHtml', html: document.body.innerHTML }));
                                            } else {
                                                var titleEl = document.querySelector('span.title') || document.querySelector('h1') || document.querySelector('.novel-detail-title');
                                                var novelTitle = titleEl ? titleEl.innerText.trim() : '未知書名';
                                                
                                                var coverEl = document.querySelector('.thumbnail img') || document.querySelector('.novel-cover img');
                                                var cover = coverEl ? coverEl.src : null;
                                                
                                                var listContainer = document.querySelector('#chapter-list') || document.querySelector('.chapter-list') || document.querySelector('.nav.chapter-list') || document.body;
                                                var links = Array.from(listContainer.querySelectorAll('a'));
                                                var chapterLinks = links.filter(function(a) {
                                                    return a.href && a.href.match(/\\/n\\/[a-zA-Z0-9]+\\/\\w+/);
                                                });
                                                
                                                var seen = {};
                                                var chapters = [];
                                                for (var i = 0; i < chapterLinks.length; i++) {
                                                    var a = chapterLinks[i];
                                                    if (!seen[a.href]) {
                                                        seen[a.href] = true;
                                                        var chapterTitle = a.innerText.trim();
                                                        if (chapterTitle) {
                                                            chapters.push({ title: chapterTitle, url: a.href });
                                                        }
                                                    }
                                                }
                                                
                                                var idMatch = window.location.href.match(/\\/n\\/([a-zA-Z0-9]+)/);
                                                var id = idMatch ? idMatch[1] : new Date().getTime().toString();
                                                
                                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                                    id: id,
                                                    url: window.location.href,
                                                    title: novelTitle,
                                                    cover: cover,
                                                    chapters: chapters
                                                }));
                                            }
                                        } catch(e) {
                                            window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.toString() }));
                                        }
                                    }
                                }, 1000);
                                true;
                            `}
                            onMessage={onWebViewMessage}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                        />
                    </View>
                </View>
            )}
        </DownloadContext.Provider>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 20,
    },
    hiddenOverlay: {
        width: 1,
        height: 1,
        opacity: 0,
        top: -100,
        left: -100,
    },
    webviewContainer: {
        width: '100%',
        height: 400,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
    },
    webviewTip: {
        textAlign: 'center',
        padding: 12,
        fontSize: 14,
        fontWeight: 'bold',
    }
});
