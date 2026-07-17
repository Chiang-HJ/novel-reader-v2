import React, { useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import { useComicDownload } from '../context/ComicDownloadContext';
import { Feather } from '@expo/vector-icons';

const FALLBACK_DOMAINS = [
    'https://18comic.vip',
    'https://jmcomic.me',
    'https://jmcomic1.me',
    'https://jmcomic.mobi',
    'https://18comic.org'
];

export default function JMComicFeedScreen({ navigation, route }) {
    const { colors, isDark } = useTheme();
    const { startDownload, activeTask, progressText } = useComicDownload();
    const webviewRef = useRef(null);
    const domainIndexRef = useRef(0);
    
    const initialQuery = route?.params?.initialQuery || 'Yaoi';
    
    const [currentDomain, setCurrentDomain] = useState(FALLBACK_DOMAINS[0]);
    const [url, setUrl] = useState(FALLBACK_DOMAINS[0] + '/search/photos?search_query=' + encodeURIComponent(initialQuery));
    const [baseUrl, setBaseUrl] = useState(FALLBACK_DOMAINS[0] + '/search/photos?search_query=' + encodeURIComponent(initialQuery));
    const [currentPage, setCurrentPage] = useState(1);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const [comics, setComics] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showBrowser, setShowBrowser] = useState(false);
    const [inputUrl, setInputUrl] = useState(route?.params?.initialQuery ? route.params.initialQuery : '');
    const [switchInfo, setSwitchInfo] = useState('');

    // Injected JS that scrapes the search results page
    const INJECTED_JAVASCRIPT = `
        (function() {
            var retryCount = 0;
            var _checkInterval = setInterval(function() {
                try {
                    retryCount++;
                    if (document.title.includes('Just a moment') || document.title.includes('Cloudflare') || document.title.includes('Attention Required')) {
                        if (retryCount > 20) {
                            clearInterval(_checkInterval);
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CLOUDFLARE_TIMEOUT' }));
                        }
                        return;
                    }

                    var titleElements = document.querySelectorAll('.video-title');
                    // Consider it loaded if we found items OR if we are on a page with pagination but no items
                    if (titleElements.length > 0 || document.querySelector('.pagination')) {
                        clearInterval(_checkInterval);
                        var results = [];
                        var seenIds = {};
                        for (var k = 0; k < titleElements.length; k++) {
                            var titleTag = titleElements[k];
                            var container = titleTag.closest('div[class*="col-"]');
                            if (!container) container = titleTag.parentElement ? titleTag.parentElement.parentElement : null;
                            if (!container) continue;

                            var aTag = container.querySelector('a');
                            var imgTag = container.querySelector('img');
                            if (!aTag || !imgTag) continue;

                            var href = aTag.getAttribute('href') || '';
                            var idMatch = href.match(/\\/(?:photo|album)\\/(\\d+)/);
                            var id = idMatch ? idMatch[1] : '';
                            if (!id || seenIds[id]) continue;

                            var cover = imgTag.getAttribute('data-original') || imgTag.getAttribute('src') || '';
                            if (cover && cover.indexOf('//') === 0) cover = 'https:' + cover;

                            var title = titleTag.innerText || '';
                            title = title.replace(/\\n/g, ' ').trim();

                            if (title && cover) {
                                seenIds[id] = true;
                                var origin = window.location.origin;
                                results.push({ id: id, title: title, cover: cover, url: origin + '/album/' + id });
                            }
                        }
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COMIC_LIST', data: results, url: window.location.href }));
                    } else if (retryCount > 15) {
                        clearInterval(_checkInterval);
                        window.ReactNativeWebView.postMessage(JSON.stringify({ 
                            type: 'LOAD_FAILED',
                            title: document.title || '',
                            html: document.body ? document.body.innerHTML.substring(0, 300) : ''
                        }));
                    }
                } catch(e) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'JS_ERROR', message: e.message }));
                }
            }, 1000);
        })();
        true;
    `;

    const tryNextDomain = (reason) => {
        const nextIndex = domainIndexRef.current + 1;
        if (nextIndex < FALLBACK_DOMAINS.length) {
            domainIndexRef.current = nextIndex;
            const nextDomain = FALLBACK_DOMAINS[nextIndex];
            setCurrentDomain(nextDomain);
            setSwitchInfo('(' + nextIndex + '/' + (FALLBACK_DOMAINS.length - 1) + ') ' + reason);
            console.log('Switching to domain:', nextDomain, 'reason:', reason);
            
            const nextBaseUrl = nextDomain + '/search/photos?search_query=Yaoi';
            setBaseUrl(nextBaseUrl);
            setCurrentPage(1);
            setHasMore(true);
            setUrl(nextBaseUrl);
            setIsLoading(true);
        } else {
            setIsLoading(false);
            setIsFetchingMore(false);
            setSwitchInfo('');
            Alert.alert('所有分流皆無法連線', reason + '\n\n請嘗試：\n1. 開啟 VPN\n2. 手動輸入可用分流網址\n3. 在 Wi-Fi 設定中將 DNS 改為 1.1.1.1');
        }
    };

    const handleMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            
            if (data.type === 'COMIC_LIST') {
                setIsLoading(false);
                setIsFetchingMore(false);
                setSwitchInfo('');
                
                if (data.data.length === 0) {
                    setHasMore(false);
                } else {
                    setComics(prev => {
                        // If it's the first page or it's a completely new URL load
                        if (currentPage === 1) return data.data;
                        
                        const newComics = [...prev];
                        const existingIds = new Set(prev.map(c => c.id));
                        data.data.forEach(c => {
                            if (!existingIds.has(c.id)) newComics.push(c);
                        });
                        return newComics;
                    });
                }
            } else if (data.type === 'CLOUDFLARE_TIMEOUT') {
                tryNextDomain('Cloudflare');
            } else if (data.type === 'LOAD_FAILED') {
                tryNextDomain('No data');
            } else if (data.type === 'NETWORK_ERROR') {
                tryNextDomain(data.message || 'Network error');
            } else if (data.type === 'JS_ERROR') {
                console.warn('JS scraping error:', data.message);
            }
        } catch(e) {
            console.warn('handleMessage parse error:', e);
        }
    };

    const handleWebViewError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('Feed WebView network error:', nativeEvent);
        handleMessage({
            nativeEvent: {
                data: JSON.stringify({
                    type: 'NETWORK_ERROR',
                    message: (nativeEvent.description || '') + ' (code ' + (nativeEvent.code || '?') + ')'
                })
            }
        });
    };

    const handleHttpError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('Feed WebView HTTP error:', nativeEvent.statusCode);
        handleMessage({
            nativeEvent: {
                data: JSON.stringify({
                    type: 'NETWORK_ERROR',
                    message: 'HTTP ' + (nativeEvent.statusCode || '?')
                })
            }
        });
    };

    const handleLoadMore = () => {
        if (!hasMore || isFetchingMore || isLoading) return;
        setIsFetchingMore(true);
        const nextPage = currentPage + 1;
        setCurrentPage(nextPage);
        const nextUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'page=' + nextPage;
        setUrl(nextUrl);
    };

    const handleDownload = (comic) => {
        startDownload(comic);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
                <View style={{ width: '100%', marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.text + '80', fontSize: 12 }}>
                        {'分流: ' + currentDomain}
                    </Text>
                    {isLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
                </View>
                <View style={{ flexDirection: 'row', width: '100%' }}>
                    <TextInput 
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        placeholder="搜尋漫畫、作者，或貼上連結..."
                        placeholderTextColor={colors.text + '80'}
                        value={inputUrl}
                        onChangeText={setInputUrl}
                    />
                    <TouchableOpacity 
                        style={[styles.btn, { backgroundColor: colors.primary }]}
                        onPress={() => {
                            if (!inputUrl.trim()) return;
                            
                            let searchDomain = currentDomain;
                            if (inputUrl.startsWith('http')) {
                                searchDomain = inputUrl.split('/').slice(0, 3).join('/');
                            }

                            if (inputUrl.includes('18comic') || inputUrl.includes('jmcomic')) {
                                const idMatch = inputUrl.match(/\/(?:photo|album)\/(\d+)/);
                                if (idMatch) {
                                    const id = idMatch[1];
                                    startDownload({ id, title: 'ID: ' + id, cover: '', url: searchDomain + '/album/' + id });
                                    setInputUrl('');
                                    
                                    // Also update the feed to use this working domain
                                    setCurrentDomain(searchDomain);
                                    domainIndexRef.current = 0;
                                    setUrl(searchDomain + '/search/photos?search_query=Yaoi');
                                    setIsLoading(true);
                                    return;
                                }
                            }
                            
                            // Treat as search query
                            setComics([]);
                            let queryText = inputUrl;
                            if (inputUrl.startsWith('http')) {
                                try {
                                    const urlObj = new URL(inputUrl);
                                    queryText = urlObj.searchParams.get('search_query') || '';
                                } catch(e) { queryText = ''; }
                            }
                            
                            const nextBaseUrl = searchDomain + '/search/photos?search_query=' + encodeURIComponent(queryText);
                            setBaseUrl(nextBaseUrl);
                            setCurrentPage(1);
                            setHasMore(true);
                            setUrl(nextBaseUrl);
                            setIsLoading(true);
                        }}
                    >
                        <Text style={styles.btnText}>執行</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.btn, { backgroundColor: colors.primary, marginLeft: 8 }]}
                        onPress={() => setShowBrowser(true)}
                    >
                        <Feather name="globe" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading && !showBrowser && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={{ color: colors.text, marginTop: 10 }}>正在抓取資料...</Text>
                    {switchInfo !== '' && (
                        <Text style={{ color: colors.primary, marginTop: 5, fontSize: 12 }}>
                            {'自動切換分流中 ' + switchInfo}
                        </Text>
                    )}
                </View>
            )}

            {!showBrowser && (
                <FlatList 
                    data={comics}
                    keyExtractor={(item, index) => item.id + '_' + index}
                    numColumns={2}
                    contentContainerStyle={{ padding: 8, paddingBottom: 100 }}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    renderItem={({ item }) => (
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Image source={{ uri: item.cover }} style={styles.cover} resizeMode="cover" />
                            <View style={styles.cardInfo}>
                                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                                <TouchableOpacity 
                                    style={[styles.dlBtn, { backgroundColor: colors.primary }]}
                                    onPress={() => handleDownload(item)}
                                >
                                    <Text style={styles.dlText}>下載</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    ListFooterComponent={() => (
                        isFetchingMore ? (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={{ color: colors.text + '80', marginTop: 8 }}>載入更多...</Text>
                            </View>
                        ) : null
                    )}
                    ListEmptyComponent={() => (
                        !isLoading ? (
                            <View style={styles.emptyContainer}>
                                <Text style={{ color: colors.text + '80' }}>沒有找到漫畫</Text>
                            </View>
                        ) : null
                    )}
                />
            )}

            <Modal visible={showBrowser} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                    <View style={styles.browserHeader}>
                        <TouchableOpacity onPress={() => {
                            setShowBrowser(false);
                            // Reload the feed after manual browsing
                            domainIndexRef.current = 0;
                            setIsLoading(true);
                            setUrl(currentDomain + '/search/photos?search_query=Yaoi');
                        }}>
                            <Feather name="x" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>手動瀏覽器</Text>
                        <View style={{ width: 24 }} />
                    </View>
                    <WebView 
                        source={{ uri: url }} 
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        originWhitelist={['*']}
                        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
                    />
                </SafeAreaView>
            </Modal>

            {!showBrowser && (
                <View style={{ width: 1, height: 1, position: 'absolute', top: -2000, opacity: 0 }} pointerEvents="none">
                    <WebView
                        ref={webviewRef}
                        source={{ uri: url }}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        originWhitelist={['*']}
                        injectedJavaScript={INJECTED_JAVASCRIPT}
                        onMessage={handleMessage}
                        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
                        onError={handleWebViewError}
                        onHttpError={handleHttpError}
                        style={{ width: 1000, height: 1000 }}
                    />
                </View>
            )}

            {activeTask && (
                <View style={[styles.progressContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontSize: 12, marginBottom: 4 }}>
                        {progressText || '下載準備中...'}
                    </Text>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressBarFill, { backgroundColor: colors.primary, width: '100%' }]} />
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchContainer: { padding: 12, borderBottomWidth: 1 },
    input: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginRight: 8 },
    btn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 8, height: 40 },
    btnText: { color: '#fff', fontWeight: 'bold' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: { flex: 1, margin: 4, borderRadius: 8, borderWidth: 1, overflow: 'hidden', maxWidth: '48%' },
    cover: { width: '100%', height: 220 },
    cardInfo: { padding: 8 },
    title: { fontSize: 12, marginBottom: 8, height: 36, lineHeight: 18 },
    dlBtn: { paddingVertical: 6, borderRadius: 4, alignItems: 'center' },
    dlText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    emptyContainer: { padding: 20, alignItems: 'center' },
    browserHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
    progressContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTopWidth: 1, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    progressBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressBarFill: { height: '100%' }
});
