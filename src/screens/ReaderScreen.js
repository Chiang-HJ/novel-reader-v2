import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { getChapterText, getNovelById, updateReadingProgress, saveChapterText, addReadingTime } from '../utils/storage';
import { getDictionaries } from '../utils/dictionaryStorage';
import { WebView } from 'react-native-webview';

import { Feather } from '@expo/vector-icons';
import CustomSlider from '../components/CustomSlider';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as Brightness from 'expo-brightness';
import { silentAudioBase64 } from '../utils/silentAudio';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { Capability, State, Event, useTrackPlayerEvents } from 'react-native-track-player';


export default function ReaderScreen({ route, navigation }) {
    useKeepAwake();
    const { colors, isDark, changeTheme, themeId, availableThemes } = useTheme();
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
    const [pitch, setPitch] = useState(1.0);
    const [brightness, setBrightness] = useState(0.5);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const [smartPauseEnabled, setSmartPauseEnabled] = useState(true);

    useEffect(() => {
        (async () => {
            const { status } = await Brightness.requestPermissionsAsync();
            if (status === 'granted') {
                const b = await Brightness.getBrightnessAsync();
                setBrightness(b);
            }
        })();
    }, []);

    const changeBrightness = async (val) => {
        setBrightness(val);
        try {
            await Brightness.setBrightnessAsync(val);
        } catch(e) {}
    };

    // Save exact sentence progress whenever it changes (e.g. from manual paging or TTS)
    useEffect(() => {
        if (novelRef.current && chapterIndexRef.current !== null && currentSentenceIndex !== null) {
            // Debounce or just save directly since AsyncStorage is reasonably fast
            updateReadingProgress(novelRef.current.id, chapterIndexRef.current, currentSentenceIndex);
        }
    }, [currentSentenceIndex]);

    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isPagingMode, setIsPagingMode] = useState(false);
    const isPagingModeRef = useRef(false);
    const [pagingDirection, setPagingDirection] = useState('horizontal'); // 'horizontal' or 'vertical'
    const pagingDirectionRef = useRef('horizontal');
    const [pageInfo, setPageInfo] = useState(null);
    const shouldStartAtLastPageRef = useRef(false);
    const shouldStartAtBottomRef = useRef(false);
    
    const [isAudioOnlyMode, setIsAudioOnlyMode] = useState(false);
    
    const [isContinuousMode, setIsContinuousMode] = useState(true);

    // Advanced Typography State
    const [fontSize, setFontSize] = useState(20);
    const [lineHeight, setLineHeight] = useState(1.8);
    const [letterSpacing, setLetterSpacing] = useState(0);

    // Sleep Timer State
    const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
    const [sleepTimerMinutes, setSleepTimerMinutesState] = useState(0); // 0 means off
    const sleepTimerMinutesRef = useRef(0);
    const setSleepTimerMinutes = (min) => {
        sleepTimerMinutesRef.current = min;
        setSleepTimerMinutesState(min);
    };
    const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0); // in seconds
    const sleepTimerIntervalRef = useRef(null);
    const isContinuousModeRef = useRef(true);
    const isSpeechPausedRef = useRef(false);
    
    const scrollViewRef = useRef(null);
    const pagingWebViewRef = useRef(null);
    const sentenceRefs = useRef([]);
    const playIdRef = useRef(0);
    const isTogglingRef = useRef(false);
    const silentSoundRef = useRef(null);
    const novelRef = useRef(null);
    const originalChapterTextRef = useRef('');
    
    const textFiltersRef = useRef([]);
    const pronunciationDictRef = useRef([]);

    const applyTextFilters = (originalText, filters) => {
        let processedText = originalText;
        filters.forEach(filter => {
            if (filter.target) {
                if (filter.isRegex) {
                    try {
                        const regex = new RegExp(filter.target, 'g');
                        processedText = processedText.replace(regex, filter.replacement || '');
                    } catch (e) {
                        processedText = processedText.split(filter.target).join(filter.replacement || '');
                    }
                } else {
                    try {
                        const cleanTarget = filter.target.replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
                        if (cleanTarget) {
                            const flexibleTarget = cleanTarget.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\u200B-\\u200D\\uFEFF]*');
                            const regex = new RegExp(flexibleTarget, 'g');
                            processedText = processedText.replace(regex, filter.replacement || '');
                        }
                    } catch (e) {
                        processedText = processedText.split(filter.target).join(filter.replacement || '');
                    }
                }
            }
        });
        return processedText;
    };

    useFocusEffect(
        useCallback(() => {
            const loadDicts = async () => {
                const dicts = await getDictionaries();
                const textFiltersChanged = JSON.stringify(textFiltersRef.current) !== JSON.stringify(dicts.textFilters);
                textFiltersRef.current = dicts.textFilters;
                pronunciationDictRef.current = dicts.pronunciationDict;

                if (textFiltersChanged && originalChapterTextRef.current) {
                    setChapterData(prev => {
                        if (!prev || !prev.text) return prev;
                        const newText = applyTextFilters(originalChapterTextRef.current, dicts.textFilters);
                        return { ...prev, text: newText };
                    });
                }
            };
            loadDicts();
        }, [])
    );

    // Reading time tracking
    useEffect(() => {
        let interval;
        const startTracking = () => {
            interval = setInterval(() => {
                if (AppState.currentState === 'active' && (!isPlayingRef.current || isSpeechPausedRef.current === false)) {
                    // Log 10 seconds of reading
                    addReadingTime(10);
                }
            }, 10000);
        };
        startTracking();
        return () => clearInterval(interval);
    }, []);
    
    // Fix background playback missing highlight when returning to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                if (isPagingModeRef.current && pagingWebViewRef.current) {
                    pagingWebViewRef.current.injectJavaScript(`
                        if (typeof highlightSentence === 'function') {
                            highlightSentence(${currentSentenceIndex});
                        }
                        true;
                    `);
                }
            }
        });
        return () => subscription.remove();
    }, [currentSentenceIndex]);
    
    

    const [isFullScreen, setIsFullScreen] = useState(false);
    const insets = useSafeAreaInsets();
    const safeTopRef = useRef(0);
    
    if (insets.top > safeTopRef.current) {
        safeTopRef.current = insets.top;
    }
    
    const [currentTime, setCurrentTime] = useState(() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    });

    useEffect(() => {
        navigation.setOptions({ headerShown: !isFullScreen });
        if (isFullScreen) {
            const timer = setInterval(() => {
                const now = new Date();
                setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }, 10000);
            return () => clearInterval(timer);
        }
    }, [isFullScreen, navigation]);

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

    useFocusEffect(
        useCallback(() => {
            return () => {
                // When leaving the screen, stop audio
                if (isPlayingRef.current) {
                    
                    isSpeechPausedRef.current = false;
                    setPlayingState(false);
                }
            };
        }, [])
    );

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const savedRate = await AsyncStorage.getItem('novel_reader_rate');
                if (savedRate) setRate(parseFloat(savedRate));
                
                const savedPitch = await AsyncStorage.getItem('novel_reader_pitch');
                if (savedPitch) setPitch(parseFloat(savedPitch));
                
                const savedSmartPause = await AsyncStorage.getItem('novel_reader_smart_pause');
                if (savedSmartPause !== null) setSmartPauseEnabled(savedSmartPause === 'true');
                
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
                
                const savedAudioOnly = await AsyncStorage.getItem('novel_reader_audioOnly');
                if (savedAudioOnly === 'true') setIsAudioOnlyMode(true);
                
                const savedContinuous = await AsyncStorage.getItem('novel_reader_continuous_mode');
                if (savedContinuous !== null) {
                    const mode = savedContinuous === 'true';
                    setIsContinuousMode(mode);
                    isContinuousModeRef.current = mode;
                }

                const savedFontSize = await AsyncStorage.getItem('novel_reader_fontSize');
                if (savedFontSize) setFontSize(parseInt(savedFontSize, 10));

                const savedLineHeight = await AsyncStorage.getItem('novel_reader_lineHeight');
                if (savedLineHeight) setLineHeight(parseFloat(savedLineHeight));

                const savedLetterSpacing = await AsyncStorage.getItem('novel_reader_letterSpacing');
                if (savedLetterSpacing) setLetterSpacing(parseFloat(savedLetterSpacing));
            } catch (e) {

            }
        };

        loadSettings();
        setupAudio();
        loadNovel();
        loadVoices();
        return () => {
            Speech.stop();

        };
    }, []);

    const prevChapter = () => {
        if (chapterIndexRef.current > 0) {
            playIdRef.current += 1;
            Speech.stop();
            isSpeechPausedRef.current = false;
            loadChapter(novelRef.current || novel, chapterIndexRef.current - 1, 0);
        } else {
            Alert.alert('提示', '已經是第一章了');
        }
    };

    const nextChapter = () => {
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
    };

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
            
            // Use a silent audio loop to keep the audio session active in the background
            const uri = 'data:audio/wav;base64,' + silentAudioBase64;
            const { sound } = await Audio.Sound.createAsync(
                { uri },
                { isLooping: true, volume: 0.01 }
            );
            silentSoundRef.current = sound;
        } catch (e) {

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
    
    const updateLockScreenMeta = async (n, title) => {
        try {
            await TrackPlayer.setupPlayer();
            await TrackPlayer.updateOptions({
                stopWithApp: false,
                alwaysPauseOnInterruption: true,
                capabilities: [
                    Capability.Play,
                    Capability.Pause,
                    Capability.Stop,
                ],
                compactCapabilities: [Capability.Play, Capability.Pause],
            });
            await TrackPlayer.reset();
            await TrackPlayer.add({
                id: '1',
                url: 'http://', 
                title: title,
                artist: n.title,
                artwork: n.coverUrl || undefined
            });
        } catch (e) {
            console.log('TrackPlayer setup failed', e);
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
            
            if (data && data.text) {
                originalChapterTextRef.current = data.text;
                data.text = applyTextFilters(data.text, textFiltersRef.current);
            }

            // Check if data is missing or empty
            if (!data || !data.text || data.text.trim() === '') {
                const url = n.chapters && n.chapters[idx] ? n.chapters[idx].url : null;
                if (url && String(url).startsWith('http')) {
                    // Start scraping via WebView
                    setScrapeUrl(url);
                    return; // Wait for onWebViewMessage
                } else {
                    // Local file missing, cannot scrape
                    applyChapterData({ title: '檔案遺失', text: '此章節的本地檔案已遺失。若是剛才匯入的書籍發生此問題，請刪除後重新匯入。' }, n.id, idx, sentenceIdx);
                    updateLockScreenMeta(n, '檔案遺失');
                    return;
                }
            }
            
            updateLockScreenMeta(n, data.title || n.chapters?.[idx]?.title || `第 ${idx+1} 章`);
            applyChapterData(data, n.id, idx, sentenceIdx);
        } catch (e) {
            setErrorLog(`讀取章節失敗: ${e.message}\n${e.stack}`);
        }
    };

    const applyChapterData = (data, nid, idx, sentenceIdx) => {
        setChapterData(data);
        const rawText = data.text || '無內容';
        const textContent = rawText;
        
        const parts = textContent.match(/[^。！？\n]+[。！？\n]*/g) || [textContent];
        let newSents = [];
        parts.forEach(p => {
            let text = p.trim();
            while (text.length > 0) {
                if (text.length <= 300) {
                    newSents.push(text);
                    break;
                }
                let sliceIdx = 300;
                let lastComma = Math.max(
                    text.lastIndexOf('，', 300),
                    text.lastIndexOf(',', 300),
                    text.lastIndexOf('；', 300),
                    text.lastIndexOf(';', 300),
                    text.lastIndexOf('、', 300)
                );
                if (lastComma > 0) {
                    sliceIdx = lastComma + 1;
                }
                newSents.push(text.substring(0, sliceIdx).trim());
                text = text.substring(sliceIdx).trim();
            }
        });
        newSents = newSents.filter(p => p.length > 0);
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
        if (isTogglingRef.current) return;
        isTogglingRef.current = true;
        try {
            if (isPlayingRef.current) {
                playIdRef.current += 1;
                Speech.stop();
                setPlayingState(false);
            } else {
                await setupAudio();
                setPlayingState(true);
                if (isSpeechPausedRef.current) {
                    isSpeechPausedRef.current = false;
                } else {
                    playIdRef.current += 1;
                    isSpeechPausedRef.current = false;
                    playFromIndex(currentSentenceIndex, sentences, playIdRef.current);
                }
            }
        } finally {
            isTogglingRef.current = false;
        }
    };

    const startSleepTimer = (minutes) => {
        setSleepTimerMinutes(minutes);
        setShowSleepTimerModal(false);
        
        if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
        
        if (minutes > 0) {
            setSleepTimerRemaining(minutes * 60);
            sleepTimerIntervalRef.current = setInterval(() => {
                setSleepTimerRemaining(prev => {
                    if (prev <= 1) {
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (minutes === -1) {
            // "End of chapter" mode, remaining time is irrelevant
            setSleepTimerRemaining(0); 
        } else {
            setSleepTimerRemaining(0);
        }
    };

    useEffect(() => {
        if (sleepTimerMinutes > 0 && sleepTimerRemaining === 0) {
            if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
            if (isPlayingRef.current) {
                togglePlay(); // Pause
            }
            setSleepTimerMinutes(0);
        }
    }, [sleepTimerRemaining, sleepTimerMinutes]);

    // Make sure we clear interval on unmount
    useEffect(() => {
        return () => {
            if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
        };
    }, []);

    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        
        if (index >= sents.length) {
            // Chapter finished
            if (sleepTimerMinutesRef.current === -1) {
                isPlayingRef.current = false;
                setPlayingState(false);
                setSleepTimerMinutes(0); // Timer finished
                // Still load the next chapter, but it won't auto-play because isPlayingRef is false
                loadChapter(novel, chapterIndexRef.current + 1, 0);
                return;
            }

            if (!isContinuousModeRef.current) {
                isPlayingRef.current = false;
                setPlayingState(false);
            }
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

        let text = sents[index];
        // Apply pronunciation corrections
        pronunciationDictRef.current.forEach(dict => {
            if (dict.target && dict.replacement) {
                if (dict.isRegex) {
                    try {
                        const regex = new RegExp(dict.target, 'g');
                        text = text.replace(regex, dict.replacement);
                    } catch (e) {
                        text = text.split(dict.target).join(dict.replacement);
                    }
                } else {
                    try {
                        const escapedTarget = dict.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const flexibleTarget = escapedTarget.replace(/[\s\u200B-\u200D\uFEFF]+/g, '[\\s\\u200B-\\u200D\\uFEFF]+');
                        const regex = new RegExp(flexibleTarget, 'g');
                        text = text.replace(regex, dict.replacement);
                    } catch (e) {
                        text = text.split(dict.target).join(dict.replacement);
                    }
                }
            }
        });

        Speech.speak(text, {
            language: 'zh-TW',
            voice: selectedVoice || undefined,
            rate,
            pitch,
            onDone: () => {
                if (playId === playIdRef.current && isPlayingRef.current) {
                    const lastChar = text.trim().slice(-1);
                    const isLongPause = ['。', '！', '？', '!', '?', '…'].includes(lastChar);
                    const pauseTime = smartPauseEnabled ? (isLongPause ? 600 : 200) : 0;
                    
                    setTimeout(() => {
                        if (playId === playIdRef.current && isPlayingRef.current) {
                            playFromIndex(index + 1, sents, playId);
                        }
                    }, pauseTime);
                }
            },
            onStopped: () => {},
            onError: () => {
                if (playId === playIdRef.current) {
                    setPlayingState(false);
                }
            }
        });
    };

    const changeRate = async (newRate) => {
        setRate(newRate);
        if (isPlayingRef.current) {
            playIdRef.current += 1;
            Speech.stop();
            isSpeechPausedRef.current = false;
            const currentPlayId = playIdRef.current;
            setTimeout(() => playFromIndex(currentSentenceIndex, sentences, currentPlayId), 100);
        }
    };

    const changePitch = async (newPitch) => {
        setPitch(newPitch);
        if (isPlayingRef.current) {
            playIdRef.current += 1;
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

    const skipPrev = () => {
        const n = novelRef.current || novel;
        if (chapterIndexRef.current > 0) {
            playIdRef.current += 1;
            Speech.stop();
            isSpeechPausedRef.current = false;
            loadChapter(n, chapterIndexRef.current - 1, 0);
        }
    };

    const pagedHtmlSource = React.useMemo(() => {
        if (!chapterData || sentences.length === 0) return { html: '' };
        return { html: `
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: ${colors.background};
            color: ${colors.text};
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            letter-spacing: ${letterSpacing}px;
            height: 100vh;
            width: 100vw;
            box-sizing: border-box;
            overflow-y: hidden !important;
            overflow-x: scroll;
            scroll-snap-type: x mandatory;
            touch-action: pan-x;
            overscroll-behavior-y: none;
          }
          .content {
            column-width: 100vw;
            column-gap: 0;
            height: 100vh;
            padding: 0;
            padding-top: 20px;
            padding-bottom: 80px;
            box-sizing: border-box;
          }
          .content p, .title {
            margin: 0 0 1em 0;
            padding: 0 20px;
            scroll-snap-align: center;
            break-inside: avoid; /* Prevent sentences from crossing page boundaries */
            -webkit-column-break-inside: avoid;
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
            let pageWidth = window.innerWidth;
            let isScrolling;
            let anchorIndex = 0;

            function updateAnchor() {
                const ps = document.querySelectorAll('p');
                for (let i = 0; i < ps.length; i++) {
                    const rect = ps[i].getBoundingClientRect();
                    if (rect.right > 10 && rect.left < window.innerWidth) {
                        anchorIndex = i;
                        break;
                    }
                }
            }

            function getScrollPos() {
                return window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
            }

            function reportPage() {
                const content = document.querySelector('.content');
                let totalPages = 1;
                if (content) {
                    totalPages = Math.max(1, Math.round(content.scrollWidth / pageWidth));
                }
                
                let currentPos = getScrollPos();
                let page = Math.round(currentPos / pageWidth) + 1;
                if (page > totalPages) page = totalPages;
                
                updateAnchor();
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'page', 
                    current: page, 
                    total: totalPages,
                    anchorIndex: anchorIndex
                }));
            }
            
            function restoreAnchor() {
                const el = document.getElementById('s' + anchorIndex);
                if (el) {
                    document.body.style.scrollSnapType = 'none';
                    document.documentElement.style.scrollSnapType = 'none';
                    
                    const rect = el.getBoundingClientRect();
                    const currentPos = getScrollPos();
                    const absoluteLeft = rect.left + currentPos;
                    const newPage = Math.floor(Math.max(0, absoluteLeft) / window.innerWidth);
                    const newLeft = newPage * window.innerWidth;
                    
                    window.scrollTo({ left: newLeft, behavior: 'auto' });
                    document.documentElement.scrollLeft = newLeft;
                    document.body.scrollLeft = newLeft;
                    
                    setTimeout(() => {
                        document.body.style.scrollSnapType = 'x mandatory';
                        document.documentElement.style.scrollSnapType = 'x mandatory';
                        reportPage();
                    }, 50);
                }
            }

            function handleScroll() {
              window.clearTimeout(isScrolling);
              isScrolling = setTimeout(() => {
                updateAnchor();
                reportPage();
              }, 150);
            }
            
            window.addEventListener('scroll', handleScroll, true);
            document.body.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', () => {
                pageWidth = window.innerWidth;
                restoreAnchor();
            });

            // Initialize anchor on load
            setTimeout(updateAnchor, 100);

            function highlightSentence(index) {
                document.querySelectorAll('p').forEach(p => p.classList.remove('active'));
                const el = document.getElementById('s' + index);
                if(el) {
                    el.classList.add('active');
                    
                    const rect = el.getBoundingClientRect();
                    const currentPos = getScrollPos();
                    const absoluteLeft = rect.left + currentPos;
                    const targetPage = Math.floor(Math.max(0, absoluteLeft) / window.innerWidth);
                    const newLeft = targetPage * window.innerWidth;
                    
                    window.scrollTo({ left: newLeft, behavior: 'auto' });
                    document.documentElement.scrollLeft = newLeft;
                    document.body.scrollLeft = newLeft;
                    
                    setTimeout(reportPage, 50);
                }
            }
            
            document.body.addEventListener('click', function(e) {
                const x = e.clientX;
                const y = e.clientY;
                const w = window.innerWidth;
                const h = window.innerHeight;
                
                e.stopPropagation();
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'tap', x, y, w, h
                }));
            }, true);
            
            let touchStartX = 0;
            let touchEndX = 0;
            let startPos = 0;
            let isSwiping = false;
            
            document.body.addEventListener('touchstart', e => {
                touchStartX = e.changedTouches[0].screenX;
                startPos = getScrollPos();
                isSwiping = true;
            }, {passive: true});
            
            document.body.addEventListener('touchend', e => {
                if (!isSwiping) return;
                touchEndX = e.changedTouches[0].screenX;
                isSwiping = false;
                
                const content = document.querySelector('.content');
                const scrollWidth = content ? content.scrollWidth : document.body.scrollWidth;
                const clientWidth = document.body.clientWidth;
                const maxScroll = Math.max(0, scrollWidth - clientWidth);
                
                const swipeDistance = touchStartX - touchEndX;
                
                // Swipe Left (Reading Forward) at the very end
                if (startPos >= maxScroll - 20 && swipeDistance > 20) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'next_chapter' }));
                }
                
                // Swipe Right (Reading Backward) at the very beginning
                if (startPos <= 20 && swipeDistance < -20) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prev_chapter' }));
                }
            }, {passive: true});
            
            setTimeout(reportPage, 500);
          </script>
        </body>
        </html>
        ` };
    }, [chapterData, sentences, colors, isDark, fontSize, lineHeight, letterSpacing]);

    useEffect(() => {
        if (!isPagingMode && scrollViewRef.current && sentences.length > 0) {
            if (shouldStartAtBottomRef.current) {
                setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: false });
                }, 100);
                shouldStartAtBottomRef.current = false;
            }
        }
    }, [sentences, isPagingMode]);

    useEffect(() => {
        if (pagingWebViewRef.current) {
            const topPad = isFullScreen ? Math.max(20, safeTopRef.current + 10) : 20;
            const botPad = isFullScreen ? Math.max(40, insets.bottom + 30) : 80;
            
            pagingWebViewRef.current.injectJavaScript(`
                (function() {
                    const content = document.querySelector('.content');
                    if (!content) return;
                    
                    if (typeof updateAnchor === 'function') updateAnchor();
                    
                    content.style.paddingTop = '${topPad}px';
                    content.style.paddingBottom = '${botPad}px';
                    
                    if (typeof restoreAnchor === 'function') {
                        // Allow browser to apply padding reflow first
                        setTimeout(restoreAnchor, 10);
                    }
                })();
                true;
            `);
        }
    }, [isFullScreen, insets.bottom]);

    if (errorLog) {
        return (
            <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{padding: 20}}>
                <Text style={{fontSize: 20, color: colors.danger, fontWeight: 'bold', marginBottom: 10}}>出現錯誤</Text>
                <Text style={{ fontSize: 16, color: colors.textSecondary, flex: 1, textAlign: 'center', marginBottom: 20 }}>
                    {errorLog}
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
            {isAudioOnlyMode ? (
                <View style={[styles.textContainer, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                    <Feather name="headphones" size={80} color="#fff" style={{ opacity: 0.3, marginBottom: 30 }} />
                    <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', paddingHorizontal: 20 }}>
                        {novel?.title}
                    </Text>
                    <Text style={{ color: '#aaa', fontSize: 18, textAlign: 'center', paddingHorizontal: 20 }}>
                        {chapterData?.title || `第 ${chapterIndex + 1} 章`}
                    </Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 50, gap: 30 }}>
                        <TouchableOpacity onPress={prevChapter} style={{ padding: 20 }}>
                            <Feather name="skip-back" size={32} color="#fff" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={togglePlay} 
                            style={{ padding: 30, backgroundColor: colors.primary, borderRadius: 50 }}
                        >
                            <Feather name={isPlaying ? "pause" : "play"} size={40} color="#fff" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity onPress={nextChapter} style={{ padding: 20 }}>
                            <Feather name="skip-forward" size={32} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    
                    <Text style={{ color: '#555', marginTop: 50 }}>純語音省電模式</Text>
                </View>
            ) : isPagingMode ? (
                <View style={styles.textContainer}>
                    <WebView 
                        ref={pagingWebViewRef}
                        source={pagedHtmlSource}
                        originWhitelist={['*']}
                        style={{ backgroundColor: 'transparent' }}
                        bounces={false}
                        showsVerticalScrollIndicator={false}
                        overScrollMode="never"
                        onLoadEnd={() => {
                            if (pagingWebViewRef.current) {
                                if (shouldStartAtLastPageRef.current) {
                                    pagingWebViewRef.current.injectJavaScript(`
                                        setTimeout(function() {
                                            const contentEl = document.querySelector('.content');
                                            const totalPages = Math.round((contentEl ? contentEl.scrollWidth : document.body.scrollWidth) / window.innerWidth) || 1;
                                            const targetScroll = (totalPages - 1) * window.innerWidth;
                                            window.scrollTo({ left: targetScroll, behavior: 'instant' });
                                            document.documentElement.scrollLeft = targetScroll;
                                            document.body.scrollLeft = targetScroll;
                                            reportPage();
                                        }, 150);
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
                                playIdRef.current += 1;
                                Speech.stop();
                                isSpeechPausedRef.current = false;
                                setCurrentSentenceIndex(data.index);
                                if (isPlayingRef.current) playFromIndex(data.index, sentences, playIdRef.current);
                            } else if (data.type === 'tap') {
                                const { x, y, w, h } = data;
                                
                                // Toggle fullscreen if tapped in center area
                                if (x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7) {
                                    setIsFullScreen(prev => !prev);
                                    return; // STOP! Don't trigger a page turn!
                                }
                                
                                let direction = 0;
                                
                                if (pagingDirectionRef.current === 'horizontal') {
                                    if (x > w * 0.5) direction = 1;
                                    else direction = -1;
                                } else {
                                    if (y < h * 0.5) direction = 1;
                                    else direction = -1;
                                }
                                
                                if (pagingWebViewRef.current) {
                                    pagingWebViewRef.current.injectJavaScript(`
                                        (function() {
                                            const pageWidth = window.innerWidth;
                                        const content = document.querySelector('.content');
                                        if (!content) return;
                                        
                                        if (${direction} === 1) {
                                            const lastEl = content.lastElementChild;
                                            if (lastEl) {
                                                const rect = lastEl.getBoundingClientRect();
                                                if (rect.right <= window.innerWidth + 5) {
                                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'next_chapter' }));
                                                    return;
                                                }
                                            }
                                        } else if (${direction} === -1) {
                                            const currentPos = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
                                            if (currentPos <= 5) {
                                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'prev_chapter' }));
                                                return;
                                            }
                                        }
                                        
                                        const currentPos = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
                                        const currentPage = Math.round(currentPos / pageWidth);
                                        const newPage = currentPage + ${direction};
                                        const newLeft = newPage * pageWidth;
                                        
                                        window.scrollTo({ left: newLeft, behavior: 'smooth' });
                                        
                                        // Backup assignment if scrollTo fails
                                        setTimeout(() => {
                                            document.documentElement.scrollLeft = newLeft;
                                            document.body.scrollLeft = newLeft;
                                            reportPage();
                                        }, 300);
                                    })();
                                    true;
                                `);
                                }
                            } else if (data.type === 'page') {
                                setPageInfo({ current: data.current, total: data.total });
                                if (data.anchorIndex !== undefined) {
                                    setCurrentSentenceIndex(data.anchorIndex);
                                }
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
                <FlatList
                    style={[styles.textContainer, isFullScreen && { paddingTop: Math.max(0, safeTopRef.current - 20) }]}
                    ref={scrollViewRef}
                    data={sentences}
                    keyExtractor={(item, index) => index.toString()}
                    initialNumToRender={20}
                    maxToRenderPerBatch={10}
                    ListHeaderComponent={() => (
                        <TouchableOpacity activeOpacity={1} onPress={() => setIsFullScreen(prev => !prev)}>
                            <Text style={[styles.title, { color: colors.text }]}>{chapterData.title}</Text>
                        </TouchableOpacity>
                    )}
                    renderItem={({ item: sent, index: i }) => (
                        <TouchableOpacity activeOpacity={1} onPress={() => setIsFullScreen(prev => !prev)}>
                            <Text 
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
                        </TouchableOpacity>
                    )}
                    ListFooterComponent={() => (
                        <TouchableOpacity activeOpacity={1} onPress={() => setIsFullScreen(prev => !prev)}>
                            <View style={{height: 120}} />
                        </TouchableOpacity>
                    )}
                    onScrollEndDrag={(e) => {
                        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                        if (contentOffset.y < -120) {
                            const n = novelRef.current || novel;
                            if (chapterIndexRef.current > 0) {
                                shouldStartAtBottomRef.current = true;
                                playIdRef.current += 1;
                                Speech.stop();
                                isSpeechPausedRef.current = false;
                                loadChapter(n, chapterIndexRef.current - 1, 0);
                            }
                        } else if (contentOffset.y + layoutMeasurement.height > contentSize.height + 120) {
                            const n = novelRef.current || novel;
                            if (chapterIndexRef.current < (n.chapterCount - 1)) {
                                playIdRef.current += 1;
                                Speech.stop();
                                isSpeechPausedRef.current = false;
                                loadChapter(n, chapterIndexRef.current + 1, 0);
                            }
                        }
                    }}
                />
            )}

            <StatusBar style={isDark ? "light" : "dark"} hidden={isFullScreen} />

            {isFullScreen && (
                <View style={{
                    position: 'absolute',
                    bottom: Math.max(insets.bottom, 10),
                    left: 20,
                    right: 20,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    pointerEvents: 'none'
                }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, opacity: 0.6, fontWeight: '500' }}>
                        {currentTime}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, opacity: 0.6, fontWeight: '500' }}>
                        第 {chapterIndex + 1} 章 {isPagingMode && pageInfo ? `(${pageInfo.current}/${pageInfo.total})` : `(${sentences.length > 0 ? Math.round((currentSentenceIndex + 1) / sentences.length * 100) : 0}%)`}
                    </Text>
                </View>
            )}

            {!isFullScreen && (
                <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={[styles.controls, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 20) }]}>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 16 }}>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, width: 36, textAlign: 'center', fontWeight: '600' }}>
                            {sentences.length > 0 ? Math.round((currentSentenceIndex / (sentences.length - 1 || 1)) * 100) : 0}%
                        </Text>
                        <CustomSlider
                            style={{ flex: 1, height: 30, marginHorizontal: 8 }}
                            minimumValue={0}
                            maximumValue={sentences.length > 0 ? sentences.length - 1 : 1}
                            value={currentSentenceIndex}
                            minimumTrackTintColor={colors.primary}
                            maximumTrackTintColor={colors.border}
                            thumbTintColor={colors.primary}
                            onSlidingComplete={(val) => {
                                const idx = Math.floor(val);
                                setCurrentSentenceIndex(idx);
                                if (isPlayingRef.current) {
                                    playIdRef.current += 1;
                                    Speech.stop();
                                    setTimeout(() => playFromIndex(idx, sentences, playIdRef.current), 100);
                                }
                            }}
                        />
                        <Text style={{ fontSize: 11, color: colors.textSecondary, width: 36, textAlign: 'center', fontWeight: '600' }}>
                            100%
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Toc', { novel })}>
                            <Feather name="list" color={colors.textSecondary} size={22} />
                        </TouchableOpacity>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 32 }}>
                            <TouchableOpacity style={styles.iconBtn} onPress={skipPrev}>
                                <Feather name="skip-back" color={colors.text} size={28} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.playBtn, { backgroundColor: colors.text }]} onPress={togglePlay}>
                                {isPlayingRef.current ? <Feather name="pause" color={colors.background} size={28} /> : <Feather name="play" color={colors.background} size={28} style={{ marginLeft: 4 }} />}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.iconBtn} onPress={skipNext}>
                                <Feather name="skip-forward" color={colors.text} size={28} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                            {sleepTimerMinutes > 0 && (
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold' }}>
                                    {Math.floor(sleepTimerRemaining / 60)}:{(sleepTimerRemaining % 60).toString().padStart(2, '0')}
                                </Text>
                            )}
                            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSleepTimerModal(true)}>
                                <Feather name="moon" color={sleepTimerMinutes > 0 ? colors.primary : colors.textSecondary} size={22} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSettingsModal(true)}>
                                <Feather name="sliders" color={colors.textSecondary} size={22} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </BlurView>
            )}

            <Modal visible={showSleepTimerModal} animationType="fade" transparent={true}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSleepTimerModal(false)}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.95)' : 'rgba(255,255,255,0.95)', paddingBottom: 30 }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>睡眠定時器</Text>
                            <TouchableOpacity onPress={() => setShowSleepTimerModal(false)}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ padding: 16, gap: 12 }}>
                            <TouchableOpacity style={[styles.optionBtn, sleepTimerMinutes === 15 && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f0f0f0' }]} onPress={() => startSleepTimer(15)}>
                                <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>15 分鐘</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.optionBtn, sleepTimerMinutes === 30 && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f0f0f0' }]} onPress={() => startSleepTimer(30)}>
                                <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>30 分鐘</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.optionBtn, sleepTimerMinutes === 60 && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f0f0f0' }]} onPress={() => startSleepTimer(60)}>
                                <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>60 分鐘</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.optionBtn, sleepTimerMinutes === -1 && { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f0f0f0' }]} onPress={() => startSleepTimer(-1)}>
                                <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>播完本章</Text>
                            </TouchableOpacity>
                            {sleepTimerMinutes !== 0 && (
                                <TouchableOpacity style={[styles.optionBtn, { borderColor: colors.danger, marginTop: 10 }]} onPress={() => startSleepTimer(0)}>
                                    <Text style={{ color: colors.danger, fontSize: 16, textAlign: 'center' }}>關閉定時</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={showSettingsModal} animationType="slide" transparent={true}>
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>閱讀設定</Text>
                            <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ padding: 16 }}>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>主題風格</Text>
                            <View style={[styles.optionsRow, { flexWrap: 'wrap', gap: 8 }]}>
                                {availableThemes.map(t => (
                                    <TouchableOpacity 
                                        key={t.id}
                                        style={[styles.optionBtn, themeId === t.id && { backgroundColor: colors.primary }]} 
                                        onPress={() => changeTheme(t.id)}
                                    >
                                        <Text style={{ color: themeId === t.id ? 'white' : colors.text }}>{t.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>進階排版設定</Text>
                            
                            <View style={{ marginBottom: 15 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <Text style={{ color: colors.text }}>字體大小</Text>
                                    <Text style={{ color: colors.textSecondary }}>{fontSize}px</Text>
                                </View>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
                                        style={{ width: '100%', height: 40 }}
                                        minimumValue={14}
                                        maximumValue={36}
                                        step={1}
                                        value={fontSize}
                                        onValueChange={(val) => {
                                            setFontSize(val);
                                            AsyncStorage.setItem('novel_reader_fontSize', val.toString());
                                        }}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor={colors.border}
                                        thumbTintColor={colors.primary}
                                    />
                                </View>
                            </View>

                            <View style={{ marginBottom: 15 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <Text style={{ color: colors.text }}>行距</Text>
                                    <Text style={{ color: colors.textSecondary }}>{lineHeight.toFixed(1)}x</Text>
                                </View>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
                                        style={{ width: '100%', height: 40 }}
                                        minimumValue={1.2}
                                        maximumValue={3.0}
                                        step={0.1}
                                        value={lineHeight}
                                        onValueChange={(val) => {
                                            setLineHeight(val);
                                            AsyncStorage.setItem('novel_reader_lineHeight', val.toString());
                                        }}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor={colors.border}
                                        thumbTintColor={colors.primary}
                                    />
                                </View>
                            </View>

                            <View style={{ marginBottom: 15 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <Text style={{ color: colors.text }}>字距</Text>
                                    <Text style={{ color: colors.textSecondary }}>{letterSpacing.toFixed(1)}px</Text>
                                </View>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
                                        style={{ width: '100%', height: 40 }}
                                        minimumValue={0}
                                        maximumValue={5}
                                        step={0.5}
                                        value={letterSpacing}
                                        onValueChange={(val) => {
                                            setLetterSpacing(val);
                                            AsyncStorage.setItem('novel_reader_letterSpacing', val.toString());
                                        }}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor={colors.border}
                                        thumbTintColor={colors.primary}
                                    />
                                </View>
                            </View>


                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>閱讀模式</Text>
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

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 10 }]}>顯示模式</Text>
                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, !isAudioOnlyMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsAudioOnlyMode(false);
                                        AsyncStorage.setItem('novel_reader_audioOnly', 'false');
                                    }}
                                >
                                    <Text style={{ color: !isAudioOnlyMode ? 'white' : colors.text }}>正常文字模式</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, isAudioOnlyMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsAudioOnlyMode(true);
                                        AsyncStorage.setItem('novel_reader_audioOnly', 'true');
                                    }}
                                >
                                    <Text style={{ color: isAudioOnlyMode ? 'white' : colors.text }}>純語音省電模式</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 10 }]}>語音自動連播</Text>
                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, !isContinuousMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsContinuousMode(false); 
                                        isContinuousModeRef.current = false; 
                                        AsyncStorage.setItem('novel_reader_continuous_mode', 'false');
                                    }}
                                >
                                    <Text style={{ color: !isContinuousMode ? 'white' : colors.text }}>播完本章停止</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, isContinuousMode && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setIsContinuousMode(true); 
                                        isContinuousModeRef.current = true; 
                                        AsyncStorage.setItem('novel_reader_continuous_mode', 'true');
                                    }}
                                >
                                    <Text style={{ color: isContinuousMode ? 'white' : colors.text }}>自動接續下一章</Text>
                                </TouchableOpacity>
                            </View>

                            {isPagingMode && !isAudioOnlyMode && (
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

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>智慧停頓 (Smart Pause)</Text>
                            <View style={styles.optionsRow}>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, !smartPauseEnabled && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setSmartPauseEnabled(false); 
                                        AsyncStorage.setItem('novel_reader_smart_pause', 'false');
                                    }}
                                >
                                    <Text style={{ color: !smartPauseEnabled ? 'white' : colors.text }}>關閉</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.optionBtn, smartPauseEnabled && { backgroundColor: colors.primary }]} 
                                    onPress={() => { 
                                        setSmartPauseEnabled(true); 
                                        AsyncStorage.setItem('novel_reader_smart_pause', 'true');
                                    }}
                                >
                                    <Text style={{ color: smartPauseEnabled ? 'white' : colors.text }}>開啟</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>螢幕亮度</Text>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 10, marginBottom: 16 }}>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
                                        style={{ width: '100%', height: 40 }}
                                        minimumValue={0.0}
                                        maximumValue={1.0}
                                        step={0.01}
                                        value={brightness}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor={colors.border}
                                        thumbTintColor={colors.primary}
                                        onValueChange={(val) => changeBrightness(val)}
                                    />
                                </View>
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音速度 ({rate.toFixed(2)}x)</Text>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 10, marginBottom: 16 }}>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
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
                                </View>
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音音調 ({pitch.toFixed(2)})</Text>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 10, marginBottom: 16 }}>
                                <View style={{ flex: 1, height: 40, justifyContent: 'center' }}>
                                    <CustomSlider
                                        style={{ width: '100%', height: 40 }}
                                        minimumValue={0.5}
                                        maximumValue={2.0}
                                        step={0.05}
                                        value={pitch}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor={colors.border}
                                        thumbTintColor={colors.primary}
                                        onValueChange={(val) => setPitch(val)}
                                        onSlidingComplete={(val) => {
                                            changePitch(val);
                                            AsyncStorage.setItem('novel_reader_pitch', val.toString());
                                        }}
                                    />
                                </View>
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>語音音色</Text>
                            {voices.length === 0 ? (
                                <Text style={{padding: 20, textAlign: 'center', color: colors.text}}>沒有找到中文語音包</Text>
                            ) : (
                                voices.map((item) => (
                                    <TouchableOpacity 
                                        key={item.identifier || item.id}
                                        style={[
                                            styles.voiceItem, 
                                            { borderBottomColor: colors.border },
                                            selectedVoice === (item.identifier || item.id) && { backgroundColor: isDark ? '#2d3748' : '#e6f4ea' }
                                        ]}
                                        onPress={() => {
                                            setSelectedVoice(item.identifier || item.id);
                                            if (isPlayingRef.current) {
                                                playIdRef.current += 1;
                                                Speech.stop();
                                                const currentPlayId = playIdRef.current;
                                                setTimeout(() => playFromIndex(currentSentenceIndex, sentences, currentPlayId), 100);
                                            }
                                        }}
                                    >
                                        <Text style={[styles.voiceName, { color: selectedVoice === (item.identifier || item.id) ? colors.primary : colors.text }, selectedVoice === (item.identifier || item.id) && { fontWeight: 'bold' }]}>
                                            {item.name} {item.language ? `(${item.language})` : ''}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.quality}</Text>
                                    </TouchableOpacity>
                                ))
                            )}
                            
                            <TouchableOpacity 
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 15 }}
                                onPress={() => {
                                    setShowSettingsModal(false);
                                    navigation.navigate('DictionaryManager');
                                }}
                            >
                                <Feather name="book-open" size={20} color={colors.text} />
                                <Text style={{ color: colors.text, fontSize: 16, marginLeft: 15, flex: 1 }}>設定文字過濾與發音校正</Text>
                                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>

                            <View style={{height: 40}} />
                        </ScrollView>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    textContainer: { flex: 1, padding: 0 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, padding: 16 },
    text: { fontSize: 18, lineHeight: 32, marginBottom: 8, paddingHorizontal: 16 },
    controls: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, paddingTop: 16 },
    btn: { alignItems: 'center', width: 48 },
    iconBtn: { padding: 8 },
    btnText: { fontSize: 12, marginTop: 4 },
    playBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.2, shadowRadius: 8 },
    webviewContainer: { height: 300, width: '100%', marginBottom: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
    webviewTip: { textAlign: 'center', padding: 8, fontSize: 12 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
    modalTitle: { fontSize: 20, fontWeight: '700' },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    optionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#ccc' },
    voiceItem: { padding: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, marginBottom: 4 },
    voiceName: { fontSize: 16 }
});
