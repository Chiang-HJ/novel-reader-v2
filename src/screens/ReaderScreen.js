import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { getChapterText, getNovelById, updateReadingProgress, getNovelDir, saveChapterText } from '../utils/storage';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import { silentAudioBase64 } from '../utils/silentAudio';

export default function ReaderScreen({ route, navigation }) {
    useKeepAwake();
    const { colors, isDark, toggleTheme } = useTheme();
    const { novelId, initialChapterIndex = null } = route.params;
    const [novel, setNovel] = useState(null);
    const [chapterIndex, setChapterIndexState] = useState(0);
    const chapterIndexRef = useRef(0);
    const [chapterData, setChapterData] = useState(null);
    const [sentences, setSentences] = useState([]);
    const [errorLog, setErrorLog] = useState(null);
    const [scrapeUrl, setScrapeUrl] = useState(null);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const isPlayingRef = useRef(false);
    const [rate, setRate] = useState(1.0);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isPagingMode, setIsPagingMode] = useState(false);
    const isPagingModeRef = useRef(false);
    const [pagingDirection, setPagingDirection] = useState('horizontal'); // 'horizontal' or 'vertical'
    const pagingDirectionRef = useRef('horizontal');
    const [pageInfo, setPageInfo] = useState(null);
    const shouldStartAtLastPageRef = useRef(false);
    
    const [isContinuousMode, setIsContinuousMode] = useState(false);
    const isContinuousModeRef = useRef(false);
    const isSpeechPausedRef = useRef(false);
    
    const scrollViewRef = useRef(null);
    const pagingWebViewRef = useRef(null);
    const sentenceRefs = useRef([]);
    const playIdRef = useRef(0);
    const silentSoundRef = useRef(null);
    const novelRef = useRef(null);

    const setChapterIndex = (idx) => {
        setChapterIndexState(idx);
        chapterIndexRef.current = idx;
    };

    const setPlayingState = (state) => {
        setIsPlaying(state);
        isPlayingRef.current = state;
        if (silentSoundRef.current) {
            if (state) {
                silentSoundRef.current.playAsync().catch(() => {});
            } else {
                silentSoundRef.current.pauseAsync().catch(() => {});
            }
        }
    };

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const savedRate = await AsyncStorage.getItem('novel_reader_rate');
                if (savedRate) setRate(parseFloat(savedRate));
                
                const savedPagingMode = await AsyncStorage.getItem('novel_reader_isPagingMode');
                if (savedPagingMode !== null) {
                    const mode = savedPagingMode === 'true';
                    setIsPagingMode(mode);
                    isPagingModeRef.current = mode;
                }
                
                const savedPagingDir = await AsyncStorage.getItem('novel_reader_pagingDirection');
                if (savedPagingDir) {
                    setPagingDirection(savedPagingDir);
                    pagingDirectionRef.current = savedPagingDir;
                }
                
                const savedContinuous = await AsyncStorage.getItem('novel_reader_isContinuousMode');
                if (savedContinuous !== null) {
                    const mode = savedContinuous === 'true';
                    setIsContinuousMode(mode);
                    isContinuousModeRef.current = mode;
                }
            } catch (e) {
                console.log('Error loading settings', e);
            }
        };

        loadSettings();
        setupAudio();
        loadVoices();
        loadNovel();
        return () => {
            Speech.stop();
        };
    }, []);

    useEffect(() => {
        if (initialChapterIndex !== null && initialChapterIndex !== chapterIndexRef.current) {
            Speech.stop();
            const n = novelRef.current || novel;
            if (n) {
                loadChapter(n, initialChapterIndex, 0);
            }
        }
    }, [initialChapterIndex]);

    useEffect(() => {
        if (novel && chapterData) {
            let title = novel.title;
            if (isPagingMode && pageInfo) {
                title += ` (${pageInfo.current}/${pageInfo.total})`;
            }
            navigation.setOptions({ title });
        }
    }, [novel, chapterData, isPagingMode, pageInfo]);

    const loadVoices = async () => {
        try {
            const allVoices = await Speech.getAvailableVoicesAsync();
            
            // Debug: save all voices to a file so we can inspect them
            try {
                const debugPath = FileSystem.documentDirectory + 'voices_debug.json';
                await FileSystem.writeAsStringAsync(debugPath, JSON.stringify(allVoices, null, 2));
            } catch(e) {}

            // The user only wants Li-mu (Regular, NOT Enhanced)
            const limuVoices = allVoices.filter(v => v.name.toLowerCase().includes('li-mu') || v.name.includes('李牧'));
            
            if (limuVoices.length > 0) {
                // Prefer Default over Enhanced
                const regularLimu = limuVoices.find(v => v.quality === 'Default' || v.quality === Speech.VoiceQuality?.Default) || limuVoices[0];
                setVoices([regularLimu]);
                setSelectedVoice(regularLimu.identifier);
            } else {
                // Fallback to empty if Li-mu is strictly the only one wanted, 
                // but just in case we provide at least one TW voice as an emergency fallback
                const twVoices = allVoices.filter(v => v.language === 'zh-TW');
                if (twVoices.length > 0) {
                    setVoices([twVoices[0]]);
                    setSelectedVoice(twVoices[0].identifier);
                } else {
                    setVoices([]);
                }
            }
        } catch(e) {
            console.warn('Failed to load voices', e);
        }
    };

    const setupAudio = async () => {
        try {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false
            });
            
            const uri = 'data:audio/wav;base64,' + silentAudioBase64;
            const { sound } = await Audio.Sound.createAsync(
                { uri },
                { isLooping: true, volume: 0.1 }
            );
            silentSoundRef.current = sound;
            
            const videoFilePath = FileSystem.documentDirectory + 'blank.mp4';
            const fileInfo = await FileSystem.getInfoAsync(videoFilePath);
            if (!fileInfo.exists) {
                await FileSystem.downloadAsync('https://www.w3schools.com/html/mov_bbb.mp4', videoFilePath);
            }
            setVideoUri(videoFilePath);
        } catch (e) {
            console.warn('Audio setup error:', e);
        }
    };

    const loadNovel = async () => {
        try {
            const n = await getNovelById(novelId);
            if (n) {
                setNovel(n);
                novelRef.current = n;
                const startIdx = initialChapterIndex !== null ? initialChapterIndex : n.progressIndex;
                await loadChapter(n, startIdx, n.progressSentence);
            } else {
                Alert.alert('錯誤', '找不到該本小說的資料');
            }
        } catch (e) {
            Alert.alert('錯誤', `加載小說失敗: ${e.message}`);
        }
    };

    const loadChapter = async (n, idx, sentenceIdx = 0) => {
        Speech.stop();
        isSpeechPausedRef.current = false;
        try {
            const totalChapters = n.chapters ? n.chapters.length : (n.chapterCount || 0);
            if (idx < 0 || (totalChapters > 0 && idx >= totalChapters)) {
                if (idx < 0) Alert.alert('提示', '已經是第一章了');
                else Alert.alert('提示', '已經是最後一章了');
                setPlayingState(false);
                return;
            }
            setChapterData(null);
            setChapterIndex(idx);
            
            let data = await getChapterText(n.id, idx);
            
            // Check if data is missing or empty (which means previous fetch failed due to Cloudflare)
            if (!data || !data.text || data.text.trim() === '') {
                if (n.chapters && n.chapters[idx]) {
                    // Start scraping via WebView
                    setScrapeUrl(n.chapters[idx].url);
                    return; // Wait for onWebViewMessage
                } else {
                    Alert.alert('錯誤', `找不到章節連結，無法下載第 ${idx + 1} 章`);
                    return;
                }
            }
            
            applyChapterData(data, n.id, idx, sentenceIdx);
        } catch (e) {
            setErrorLog(`讀取章節失敗: ${e.message}\n${e.stack}`);
        }
    };

    const applyChapterData = (data, nid, idx, sentenceIdx) => {
        setChapterData(data);
        const textContent = data.text || '無內容';
        const parts = textContent.match(/[^。！？\n]+[。！？\n]*/g) || [textContent];
        const newSents = parts.map(p => p.trim()).filter(p => p.length > 0);
        setSentences(newSents);
        setCurrentSentenceIndex(sentenceIdx);
        
        updateReadingProgress(nid, idx, sentenceIdx);
        
        if (isPlayingRef.current) {
            playIdRef.current += 1;
            const currentPlayId = playIdRef.current;
            setTimeout(() => playFromIndex(0, newSents, currentPlayId), 500);
        }
        
        // If paging mode is active, tell WebView to highlight the first sentence
        if (isPagingModeRef.current && pagingWebViewRef.current) {
            pagingWebViewRef.current.injectJavaScript(`
                highlightSentence(${sentenceIdx});
                true;
            `);
        }
    };

    const onWebViewMessage = async (event) => {
        const dataStr = event.nativeEvent.data;
        if (!dataStr) return;
        try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
                setErrorLog(`抓取章節錯誤: ${parsed.error}`);
                setScrapeUrl(null);
                return;
            }
            
            const text = parsed.text;
            const currentIdx = chapterIndexRef.current;
            const n = novelRef.current || novel;
            const title = n.chapters[currentIdx].title;
            
            // Save local
            await saveChapterText(n.id, currentIdx, title, text);
            
            setScrapeUrl(null);
            applyChapterData({ title, text }, n.id, currentIdx, 0);
        } catch(e) {
            setErrorLog(`處理章節資料錯誤: ${e.message}`);
            setScrapeUrl(null);
        }
    };

    const togglePlay = async () => {
        if (isPlayingRef.current) {
            if (isContinuousModeRef.current) {
                await Speech.pause();
                isSpeechPausedRef.current = true;
            } else {
                playIdRef.current += 1; // Invalidate
                Speech.stop();
            }
            setPlayingState(false);
        } else {
            await setupAudio(); // Re-assert audio mode priority
            setPlayingState(true);
            if (isContinuousModeRef.current && isSpeechPausedRef.current) {
                await Speech.resume();
                isSpeechPausedRef.current = false;
            } else {
                playIdRef.current += 1;
                isSpeechPausedRef.current = false;
                playFromIndex(currentSentenceIndex, sentences, playIdRef.current);
            }
        }
    };

    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        
        if (index >= sents.length) {
            // Chapter finished, go next
            loadChapter(novel, chapterIndexRef.current + 1, 0);
            return;
        }

        setCurrentSentenceIndex(index);
        updateReadingProgress(novelId, chapterIndexRef.current, index);
        
        // If in paging mode, highlight via JS, but ONLY if app is in foreground
        // Injecting JS while the app is backgrounded can freeze the JS bridge or crash playback on iOS/Android
        if (isPagingModeRef.current && pagingWebViewRef.current && AppState.currentState === 'active') {
            pagingWebViewRef.current.injectJavaScript(`
                highlightSentence(${index});
                true;
            `);
        }
        
        if (isContinuousModeRef.current) {
            // Join the remaining sentences for a single uninterrupted speech session
            const remainingText = sents.slice(index).join(' ');
            Speech.speak(remainingText, {
                language: 'zh-TW',
                voice: selectedVoice,
                rate: rate,
                onDone: () => {
                    if (isPlayingRef.current && playId === playIdRef.current) {
                        loadChapter(novelRef.current, chapterIndexRef.current + 1, 0);
                    }
                },
                onStopped: () => {},
                onError: () => {
                    if (playId === playIdRef.current) {
                        setPlayingState(false);
                    }
                }
            });
        } else {
            const textToSpeak = sents[index];
            Speech.speak(textToSpeak, {
                language: 'zh-TW',
                voice: selectedVoice,
                rate: rate,
                onDone: () => {
                    if (isPlayingRef.current && playId === playIdRef.current) {
                        playFromIndex(index + 1, sents, playId);
                    }
                },
                onStopped: () => {},
                onError: () => {
                    if (playId === playIdRef.current) {
                        setPlayingState(false);
                    }
                }
            });
        }
    };

    const changeRate = async (newRate) => {
        setRate(newRate);
        if (isPlayingRef.current) {
            playIdRef.current += 1;
            
            if (isContinuousModeRef.current) {
                // In continuous mode on iOS, stop() fails if not paused first
                await Speech.pause();
            }
            Speech.stop();
            isSpeechPausedRef.current = false;
            
            const currentPlayId = playIdRef.current;
            setTimeout(() => playFromIndex(currentSentenceIndex, sentences, currentPlayId), 100);
        }
    };

    const skipNext = () => {
        playIdRef.current += 1;
        Speech.stop();
        isSpeechPausedRef.current = false;
        const n = novelRef.current || novel;
        loadChapter(n, chapterIndexRef.current + 1, 0);
    };

    const pagedHtmlSource = React.useMemo(() => {
        if (!chapterData || sentences.length === 0) return { html: '' };
        return { html: `
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body {
            margin: 0;
            padding: 0;
            background: ${colors.background};
            color: ${colors.text};
            font-size: 20px;
            line-height: 1.8;
            height: 100vh;
            width: 100vw;
            box-sizing: border-box;
            overflow-y: hidden;
            overflow-x: scroll;
            scroll-snap-type: x mandatory;
          }
          .content {
            column-width: 100vw;
            column-gap: 0;
            height: 100vh;
            padding: 0;
            padding-top: 20px;
            padding-bottom: 80px; /* space for controls */
            box-sizing: border-box;
          }
          .content p, .title {
            margin: 0 0 1em 0;
            padding: 0 20px;
            scroll-snap-align: center;
          }
          .content p.active {
            background-color: ${colors.highlight || 'rgba(100,149,237,0.3)'};
            border-radius: 4px;
          }
          .title {
            font-size: 26px;
            font-weight: bold;
            margin-bottom: 20px;
          }
        </style>
        </head>
        <body>
          <div class="content">
            <div class="title">${chapterData.title}</div>
            ${sentences.map((p, i) => `<p id="s${i}" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'click', index: ${i}}))">${p}</p>`).join('')}
          </div>
          <script>
            const pageWidth = window.innerWidth;
            let isScrolling;
            
            function reportPage() {
                const content = document.querySelector('.content');
                let totalPages = 1;
                if (content && content.lastElementChild) {
                    const rect = content.lastElementChild.getBoundingClientRect();
                    const absoluteRight = rect.right + window.scrollX;
                    totalPages = Math.max(1, Math.ceil((absoluteRight - 5) / pageWidth));
                }
                
                let currentPos = window.scrollX;
                let page = Math.round(currentPos / pageWidth) + 1;
                if (page > totalPages) page = totalPages;
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page', current: page, total: totalPages }));
            }

            window.addEventListener('scroll', () => {
              window.clearTimeout(isScrolling);
              isScrolling = setTimeout(() => {
                let currentPos = window.scrollX;
                let page = Math.round(currentPos / pageWidth);
                window.scrollTo({ left: page * pageWidth, behavior: 'auto' });
                reportPage();
              }, 100);
            });

            function highlightSentence(index) {
                document.querySelectorAll('p').forEach(p => p.classList.remove('active'));
                const el = document.getElementById('s' + index);
                if(el) {
                    el.classList.add('active');
                    // Scroll to make element visible horizontally instantly
                    el.scrollIntoView({ inline: 'center', behavior: 'auto', block: 'nearest' });
                    setTimeout(reportPage, 150);
                }
            }
            
            document.body.addEventListener('click', function(e) {
                // If the user clicked on a <p>, let it trigger the sentence selection 
                // UNLESS we want pure 50/50 pagination. Wait, if we use capture phase 'true', 
                // we prevent sentence clicks. The user asked for "直接切成各50%".
                // But we still need sentence selection. So we check if the click target is a <p>.
                // Actually, if we want to allow sentence selection, we should only prevent default 
                // if they tap in the empty spaces? But the user wants exactly 50/50 tap zones.
                // We'll let React Native handle the logic.
                const x = e.clientX;
                const y = e.clientY;
                const w = window.innerWidth;
                const h = window.innerHeight;
                
                // Only send tap event if it's NOT a paragraph click, OR if we force it.
                // But wait, the previous code caught everything because of 'true' capture phase.
                // Let's keep it 'true' but we can't select sentences anymore? 
                // Let's pass the nodeName to RN to decide.
                const targetNode = e.target.nodeName.toLowerCase();
                const targetId = e.target.id;
                
                e.stopPropagation();
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'tap', x, y, w, h, targetNode, targetId 
                }));
            }, true);
            
            setTimeout(reportPage, 500);
          </script>
        </body>
        </html>
        `};
    }, [chapterData, sentences, colors]);

    if (errorLog) {
        return (
            <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{padding: 20}}>
                <Text style={{fontSize: 20, color: colors.danger, fontWeight: 'bold', marginBottom: 10}}>出現錯誤</Text>
                <Text style={{ fontSize: 16, color: colors.textSecondary, flex: 1, textAlign: 'center' }} numberOfLines={1}>
                    {novel?.title || '載入中...'} {isPagingMode && pageInfo ? `(${pageInfo.current}/${pageInfo.total})` : ''}
                </Text>
                <TouchableOpacity 
                    style={{backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: 'center'}}
                    onPress={() => setErrorLog(null)}
                >
                    <Text style={{color: 'white', fontWeight: 'bold'}}>關閉</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    if (scrapeUrl) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.webviewContainer, { borderColor: colors.border }]}>
                    <Text style={[styles.webviewTip, { backgroundColor: colors.surface, color: colors.text }]}>正在突破 Cloudflare 防護抓取本章內容...</Text>
                    <WebView 
                        source={{ uri: scrapeUrl }} 
                        injectedJavaScript={`
                            var checkInterval = setInterval(function() {
                                var title = document.title || '';
                                if (title.indexOf('Just a moment') === -1 && title.indexOf('Cloudflare') === -1 && title.indexOf('Attention Required') === -1) {
                                    clearInterval(checkInterval);
                                    try {
                                        var contentMatch = document.body.innerHTML.match(/<div class="content">([\\s\\S]*?)<\\/div>/);
                                        var text = '';
                                        if (contentMatch) {
                                            text = contentMatch[1].replace(/<script[\\s\\S]*?<\\/script>/gi, '');
                                            text = text.replace(/<br\\s*\\/?>/gi, '\\n');
                                            text = text.replace(/<[^>]+>/g, '');
                                            text = text.trim();
                                        }
                                        window.ReactNativeWebView.postMessage(JSON.stringify({ text: text }));
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
                <ActivityIndicator size="large" color={colors.primary} style={{flex: 1}} />
            </View>
        );
    }

    if (!chapterData) {
        return <View style={[styles.container, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} style={{flex:1}} /></View>;
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {isPagingMode ? (
                <View style={styles.textContainer}>
                    <WebView 
                        ref={pagingWebViewRef}
                        source={pagedHtmlSource}
                        originWhitelist={['*']}
                        style={{ backgroundColor: 'transparent' }}
                        onLoadEnd={() => {
                            if (pagingWebViewRef.current) {
                                if (shouldStartAtLastPageRef.current) {
                                    pagingWebViewRef.current.injectJavaScript(`
                                        const contentEl = document.querySelector('.content');
                                        const totalPages = Math.round((contentEl ? contentEl.scrollWidth : document.body.scrollWidth) / window.innerWidth) || 1;
                                        window.scrollTo({ left: (totalPages - 1) * window.innerWidth, behavior: 'auto' });
                                        reportPage();
                                        true;
                                    `);
                                    shouldStartAtLastPageRef.current = false;
                                } else {
                                    pagingWebViewRef.current.injectJavaScript(`
                                        highlightSentence(${currentSentenceIndex});
                                        true;
                                    `);
                                }
                            }
                        }}
                        onMessage={(event) => {
                            const data = JSON.parse(event.nativeEvent.data);
                            if (data.type === 'click') {
                                // This is triggered by <p> tags, but since we capture clicks, it might not be triggered.
                                playIdRef.current += 1;
                                Speech.stop();
                                isSpeechPausedRef.current = false;
                                setCurrentSentenceIndex(data.index);
                                if (isPlayingRef.current) playFromIndex(data.index, sentences, playIdRef.current);
                            } else if (data.type === 'tap') {
                                // If they clicked a paragraph specifically, we can treat it as a sentence click
                                // BUT the user specifically asked for exactly 50/50 pagination layout.
                                // We will treat all taps as pagination.
                                const { x, y, w, h } = data;
                                let direction = 0;
                                
                                if (pagingDirectionRef.current === 'horizontal') {
                                    if (x > w * 0.5) direction = 1; // Right 50%
                                    else direction = -1; // Left 50%
                                } else {
                                    if (y < h * 0.5) direction = 1; // Top 50% -> Next
                                    else direction = -1; // Bottom 50% -> Prev
                                }
                                
                                pagingWebViewRef.current.injectJavaScript(`
                                    (function() {
                                        const pageWidth = window.innerWidth;
                                        const content = document.querySelector('.content');
                                        if (!content) return;
                                        
                                        if (${direction} === 1) {
                                            const lastEl = content.lastElementChild;
                                            if (lastEl) {
                                                const rect = lastEl.getBoundingClientRect();
                                                // If the right edge of the last element is visible on screen
                                                if (rect.right <= window.innerWidth + 5) {
                                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'next_chapter' }));
                                                    return;
                                                }
                                            }
                                        } else if (${direction} === -1) {
                                            if (window.scrollX <= 5) {
                                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prev_chapter' }));
                                                return;
                                            }
                                        }
                                        
                                        // Normal page turn
                                        const currentPage = Math.round(window.scrollX / pageWidth);
                                        const newPage = currentPage + ${direction};
                                        window.scrollTo({ left: newPage * pageWidth, behavior: 'auto' });
                                        reportPage();
                                    })();
                                    true;
                                `);
                            } else if (data.type === 'page') {
                                setPageInfo({ current: data.current, total: data.total });
                            } else if (data.type === 'prev_chapter') {
                                if (chapterIndexRef.current > 0) {
                                    shouldStartAtLastPageRef.current = true;
                                    playIdRef.current += 1;
                                    Speech.stop();
                                    isSpeechPausedRef.current = false;
                                    const n = novelRef.current || novel;
                                    loadChapter(n, chapterIndexRef.current - 1, 0);
                                } else {
                                    Alert.alert('提示', '已經是第一章，無法再往前了');
                                }
                            } else if (data.type === 'next_chapter') {
                                const n = novelRef.current || novel;
                                const totalChapters = n ? (n.chapters ? n.chapters.length : (n.chapterCount || 0)) : 0;
                                if (n && chapterIndexRef.current < totalChapters - 1) {
                                    playIdRef.current += 1;
                                    Speech.stop();
                                    isSpeechPausedRef.current = false;
                                    loadChapter(n, chapterIndexRef.current + 1, 0);
                                } else {
                                    Alert.alert('提示', '已經是最後一章了');
                                }
                            }
                        }}
                    />
                </View>
            ) : (
                <ScrollView 
                    style={styles.textContainer}
                    ref={scrollViewRef}
                >
                    <Text style={[styles.title, { color: colors.text }]}>{chapterData.title}</Text>
                    {sentences.map((sent, i) => (
                        <Text 
                            key={i} 
                            style={[
                                styles.text,
                                { color: colors.text },
                                currentSentenceIndex === i && { backgroundColor: colors.highlight, borderRadius: 4, overflow: 'hidden' }
                            ]}
                            onPress={() => {
                                playIdRef.current += 1;
                                Speech.stop();
                                setCurrentSentenceIndex(i);
                                if (isPlayingRef.current) playFromIndex(i, sentences, playIdRef.current);
                            }}
                        >
                            {sent}
                        </Text>
                    ))}
                    <View style={{height: 100}} />
                </ScrollView>
            )}

            <View style={[styles.controls, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Toc', { novel })}>
                    <Feather name="list" color={colors.text} size={24} />
                    <Text style={[styles.btnText, { color: colors.text }]}>目錄</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={toggleTheme}>
                    <Feather name={isDark ? "sun" : "moon"} color={colors.text} size={24} />
                    <Text style={[styles.btnText, { color: colors.text }]}>{isDark ? "白天" : "黑夜"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.playBtn, { backgroundColor: colors.primary }]} onPress={togglePlay}>
                    {isPlayingRef.current ? <Feather name="pause" color="white" size={32} /> : <Feather name="play" color="white" size={32} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => setShowSettingsModal(true)}>
                    <Feather name="settings" color={colors.text} size={24} />
                    <Text style={[styles.btnText, { color: colors.text }]}>設定</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={skipNext}>
                    <Feather name="skip-forward" color={colors.text} size={24} />
                    <Text style={[styles.btnText, { color: colors.text }]}>下一章</Text>
                </TouchableOpacity>
            </View>

            <Modal visible={showSettingsModal} animationType="slide" transparent={true}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>閱讀設定</Text>
                            <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                                <Feather name="x" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ padding: 16, maxHeight: '80%' }}>
                            {/* Speech Mode */}
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音播放模式</Text>
                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, !isContinuousMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsContinuousMode(false); 
                                        isContinuousModeRef.current = false; 
                                        AsyncStorage.setItem('novel_reader_isContinuousMode', 'false');
                                    }}
                                >
                                    <Text style={{ color: !isContinuousMode ? 'white' : colors.text }}>逐句亮字模式</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, isContinuousMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsContinuousMode(true); 
                                        isContinuousModeRef.current = true; 
                                        AsyncStorage.setItem('novel_reader_isContinuousMode', 'true');
                                        Alert.alert('提示', '連續模式下將暫停逐句亮字，但可保證 iPhone 鎖定螢幕後能穩定播放。');
                                    }}
                                >
                                    <Text style={{ color: isContinuousMode ? 'white' : colors.text }}>背景連續模式</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Reading Mode */}
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 10 }]}>閱讀模式</Text>
                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, !isPagingMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsPagingMode(false); 
                                        isPagingModeRef.current = false; 
                                        AsyncStorage.setItem('novel_reader_isPagingMode', 'false');
                                    }}
                                >
                                    <Text style={{ color: !isPagingMode ? 'white' : colors.text }}>上下滑動</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, isPagingMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsPagingMode(true); 
                                        isPagingModeRef.current = true; 
                                        AsyncStorage.setItem('novel_reader_isPagingMode', 'true');
                                    }}
                                >
                                    <Text style={{ color: isPagingMode ? 'white' : colors.text }}>左右翻頁</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Paging Zone Mode (only visible in Paging Mode) */}
                            {isPagingMode && (
                                <>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>翻頁觸控區塊 (直接切各50%)</Text>
                                    <View style={styles.optionsRow}>
                                        <TouchableOpacity 
                                            style={[styles.optionBtn, pagingDirection === 'horizontal' && { backgroundColor: colors.primary }]} 
                                            onPress={() => { 
                                                setPagingDirection('horizontal'); 
                                                pagingDirectionRef.current = 'horizontal'; 
                                                AsyncStorage.setItem('novel_reader_pagingDirection', 'horizontal');
                                            }}
                                        >
                                            <Text style={{ color: pagingDirection === 'horizontal' ? 'white' : colors.text }}>左右切割 (左退右進)</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.optionBtn, pagingDirection === 'vertical' && { backgroundColor: colors.primary }]} 
                                            onPress={() => { 
                                                setPagingDirection('vertical'); 
                                                pagingDirectionRef.current = 'vertical'; 
                                                AsyncStorage.setItem('novel_reader_pagingDirection', 'vertical');
                                            }}
                                        >
                                            <Text style={{ color: pagingDirection === 'vertical' ? 'white' : colors.text }}>上下切割 (下退上進)</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* TTS Speed */}
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音速度 ({rate.toFixed(2)}x)</Text>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 10, marginBottom: 16 }}>
                                <Slider
                                    style={{ width: '100%', height: 40 }}
                                    minimumValue={0.5}
                                    maximumValue={2.5}
                                    step={0.05}
                                    value={rate}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.border}
                                    thumbTintColor={colors.primary}
                                    onValueChange={(val) => setRate(val)}
                                    onSlidingComplete={(val) => {
                                        changeRate(val);
                                        AsyncStorage.setItem('novel_reader_rate', val.toString());
                                    }}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>0.5x</Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>1.5x</Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>2.5x</Text>
                                </View>
                            </View>

                            {/* TTS Voice */}
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音音色</Text>
                            {voices.length === 0 ? (
                                <Text style={{padding: 20, textAlign: 'center', color: colors.text}}>沒有找到中文語音包</Text>
                            ) : (
                                voices.map((item) => (
                                    <TouchableOpacity 
                                        key={item.identifier}
                                        style={[
                                            styles.voiceItem, 
                                            { borderBottomColor: colors.border },
                                            selectedVoice === item.identifier && { backgroundColor: isDark ? '#2d3748' : '#e6f4ea' }
                                        ]}
                                        onPress={() => {
                                            setSelectedVoice(item.identifier);
                                            if (isPlayingRef.current) {
                                                playIdRef.current += 1;
                                                Speech.stop();
                                                const currentPlayId = playIdRef.current;
                                                setTimeout(() => playFromIndex(currentSentenceIndex, sentences, currentPlayId), 100);
                                            }
                                        }}
                                    >
                                        <Text style={[styles.voiceName, { color: selectedVoice === item.identifier ? colors.primary : colors.text }, selectedVoice === item.identifier && { fontWeight: 'bold' }]}>
                                            {item.name} ({item.language})
                                        </Text>
                                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.quality}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                            <View style={{height: 40}} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    textContainer: { flex: 1, padding: 16 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    text: { fontSize: 18, lineHeight: 32, marginBottom: 8 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 16, borderTopWidth: 1 },
    btn: { alignItems: 'center', width: 48 },
    btnText: { fontSize: 12, marginTop: 4 },
    playBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    webviewContainer: { height: 300, width: '100%', marginBottom: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
    webviewTip: { textAlign: 'center', padding: 8, fontSize: 12 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    optionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#ccc' },
    voiceItem: { padding: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, marginBottom: 4 },
    voiceName: { fontSize: 16 }
});
