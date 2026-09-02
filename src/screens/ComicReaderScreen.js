import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, ScrollView, Image, TouchableWithoutFeedback, LayoutAnimation, UIManager, Platform, Alert, InteractionManager, Modal } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getChapterText, getNovelById, updateReadingProgress, saveChapterText, addReadingTime } from '../utils/storage';
import { getDictionaries } from '../utils/dictionaryStorage';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import ScrambledImage from '../components/ScrambledImage';
import BoyloveImage from '../components/BoyloveImage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useComicDownload } from '../context/ComicDownloadContext';

const { width, height } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AutoHeightImage = ({ uri, screenWidth, isHorizontal, screenHeight, onRetry }) => {
    const [imgHeight, setImgHeight] = useState(screenWidth / 0.7);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    if (error) {
        return (
            <TouchableOpacity onPress={onRetry}>
                <View style={{ width: screenWidth, height: screenWidth * 1.2, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
                    <Feather name="image" size={48} color="#444" />
                    <Text style={{ color: '#666', marginTop: 12 }}>圖片載入失敗，點擊重新下載</Text>
                    <Text style={{ color: '#444', marginTop: 8, fontSize: 10 }}>{uri.split('/').pop()}</Text>
                </View>
            </TouchableOpacity>
        );
    }

    return (
        <View style={{ width: screenWidth, height: isHorizontal ? screenHeight : imgHeight, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
            {!loaded && <ActivityIndicator size="small" color="#555" style={{ position: 'absolute' }} />}
            <Image 
                source={{ uri }} 
                style={{ 
                    width: screenWidth, 
                    height: isHorizontal ? screenHeight : imgHeight,
                    opacity: 1 // Fix iOS aborting invisible images
                }} 
                resizeMode={isHorizontal ? "contain" : "cover"} 
                onLoad={(e) => {
                    const { width: w, height: h } = e.nativeEvent.source;
                    if (w > 0 && h > 0) {
                        setImgHeight(screenWidth * (h / w));
                    }
                    setLoaded(true);
                }}
                onError={() => setError(true)}
            />
        </View>
    );
};

export default function ComicReaderScreen({ route, navigation }) {
    const { novelId, title, isVault, initialChapterIndex } = route.params;
    const { colors, isDark } = useTheme();
    const { retryFailedChapters, retryChapterDownload } = useComicDownload();

    const [novel, setNovel] = useState(null);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [pages, setPages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI state
    const [isHorizontal, setIsHorizontal] = useState(false);
    const [showHeader, setShowHeader] = useState(true);
    const [showTOC, setShowTOC] = useState(false);
    const [algorithmMode, setAlgorithmMode] = useState(0);

    const [selectedChapterForOptions, setSelectedChapterForOptions] = useState(null);
    const [showOptionsModal, setShowOptionsModal] = useState(false);

    const handleRetryFailedChapters = () => {
        Alert.alert('修復失敗', '即將掃描並重新下載遺失的章節。', [
            { text: '取消', style: 'cancel' },
            { 
                text: '確定', 
                onPress: () => {
                    setShowTOC(false);
                    retryFailedChapters(novelId);
                    navigation.goBack();
                }
            }
        ]);
    };

    // Zoom state
    const [zoomRatio, setZoomRatio] = useState(2.0);
    const flatListRef = useRef(null);
    const scrollViewRef = useRef(null);
    const lastTap = useRef(0);
    
    // Native zoom tracking
    const scrollY = useRef(0);
    const scrollX = useRef(0);
    const currentZoom = useRef(1);
    const horizontalScrollRefs = useRef({});
    const horizontalZoomScale = useRef({});

    const toggleHeader = () => setShowHeader(!showHeader);
    const toggleHeaderRef = useRef(toggleHeader);
    useEffect(() => {
        toggleHeaderRef.current = toggleHeader;
    }, [showHeader]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const ratio = await AsyncStorage.getItem('@comic_zoom_ratio');
                if (ratio) setZoomRatio(parseFloat(ratio));
            } catch (e) {}

            const data = await getNovelById(novelId);
            setNovel(data);
            
            if (data && data.chapterCount > 0) {
                const startIdx = initialChapterIndex !== undefined ? initialChapterIndex : (data.progressIndex || 0);
                loadChapter(startIdx, data);
            } else {
                setIsLoading(false);
            }
        };
        InteractionManager.runAfterInteractions(() => {
            loadInitialData();
        });
    }, []);

    const loadChapter = async (index, novelData) => {
        setIsLoading(true);
        setCurrentChapterIndex(index);
        setPages([]);                     // clear stale pages immediately
        setChapterIsScrambled(undefined); // reset scramble flag immediately
        updateReadingProgress(novelId, index);
        
        try {
            const chapterData = await getChapterText(novelId, index.toString());
            if (chapterData && chapterData.pages && chapterData.pages.length > 0) {
                // Fix absolute paths that might have broken due to UUID changes on iOS
                const fixedPages = chapterData.pages.map(p => {
                    if (typeof p === 'string' && !p.startsWith('http')) {
                        const imagesSearch = '/images/';
                        const imagesIndex = p.indexOf(imagesSearch);
                        if (imagesIndex !== -1) {
                            const afterImages = p.substring(imagesIndex + imagesSearch.length);
                            const getNovelDir = (id) => `${FileSystem.documentDirectory}novels/${id}/`;
                            return getNovelDir(novelId) + "images/" + afterImages;
                        }
                    }
                    return p;
                });
                setPages(fixedPages);
                setChapterIsScrambled(chapterData.isScrambled);
            } else {
                setPages([]);
                setChapterIsScrambled(undefined);
            }
        } catch (e) {
            setPages([]);
            setChapterIsScrambled(undefined);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageTap = (e, index) => {
        const now = Date.now();
        if (now - lastTap.current < 500) {
            // Double tap — toggle zoom
            const tapX = e.nativeEvent.pageX;
            const tapY = e.nativeEvent.pageY;

            if (isHorizontal) {
                // Horizontal mode: per-page ScrollView zoom
                const responder = horizontalScrollRefs.current[index]?.getScrollResponder?.() || horizontalScrollRefs.current[index];
                if (responder && responder.scrollResponderZoomTo) {
                    const Z_c = horizontalZoomScale.current[index] || 1;
                    if (Z_c > 1.1) {
                        responder.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
                    } else {
                        const targetWidth = width / zoomRatio;
                        const targetHeight = height / zoomRatio;
                        responder.scrollResponderZoomTo({ x: tapX - targetWidth / 2, y: tapY - targetHeight / 2, width: targetWidth, height: targetHeight, animated: true });
                    }
                }
            } else {
                // Vertical mode: native ScrollView scrollResponderZoomTo
                const ref = scrollViewRef.current;
                if (ref) {
                    const responder = ref.getScrollResponder ? ref.getScrollResponder() : null;
                    if (responder && responder.scrollResponderZoomTo) {
                        const Z_c = currentZoom.current || 1;
                        if (Z_c > 1.1) {
                            // Zoom out to 1x
                            // Calculate the center of the current viewport in the zoomed content
                            const currentCenterY = scrollY.current + height / 2;
                            // Convert to 1x coordinate space
                            const unzoomedCenterY = currentCenterY / Z_c;
                            // Calculate the target Y to place this center at the middle of the screen
                            const targetY = Math.max(0, unzoomedCenterY - height / 2);
                            responder.scrollResponderZoomTo({ x: 0, y: targetY, width, height, animated: true });
                        } else {
                            // Zoom in centred on tap point
                            const targetWidth = width / zoomRatio;
                            const targetHeight = height / zoomRatio;
                            const x = Math.max(0, tapX - targetWidth / 2);
                            const y = Math.max(0, scrollY.current + tapY - targetHeight / 2);
                            responder.scrollResponderZoomTo({ x, y, width: targetWidth, height: targetHeight, animated: true });
                        }
                    }
                }
            }
            lastTap.current = 0;
        } else {
            lastTap.current = now;
            setTimeout(() => {
                if (lastTap.current === now) {
                    toggleHeaderRef.current();
                }
            }, 300);
        }
    };
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    
    const [descrambleOverride, setDescrambleOverride] = useState('auto'); // 'auto', 'on', 'off'
    const [chapterIsScrambled, setChapterIsScrambled] = useState(undefined);

    const showZoomSettings = () => {
        Alert.alert('設定', '請選擇設定：', [
            { text: '開啟選單', onPress: () => setIsMenuVisible(true) },
            { text: '更換圖片來源 (如圖片破圖)', onPress: () => {
                Alert.alert('提示', '請手動重新整理或返回重進以載入新來源', [
                    { text: '好', style: 'cancel' }
                ]);
            }},
            { text: `強制解密 (${descrambleOverride === 'on' ? '開' : descrambleOverride === 'off' ? '關' : '自動'})`, onPress: () => {
                let nextState = 'auto';
                if (descrambleOverride === 'auto') nextState = 'on';
                else if (descrambleOverride === 'on') nextState = 'off';
                
                setDescrambleOverride(nextState);
                Alert.alert('提示', `已切換為：${nextState === 'on' ? '強制解密' : nextState === 'off' ? '強制不解密' : '自動'}`);
            }},
            { text: '切換解析算法 (除錯用)', onPress: () => {
                const nextMode = (algorithmMode + 1) % 7;
                setAlgorithmMode(nextMode);
                Alert.alert('已切換', `切換到算法 ${nextMode}\n請觀察破圖位置是否修復`);
            }},
            { text: '取消', style: 'cancel' }
        ]);
    };

    // iOS Document Directory changes UUID across app updates. 
    // We must dynamically fix old absolute paths.
    const resolveLocalPath = (path) => {
        let resolved = path;
        if (typeof path === 'string' && path.includes('/novels/')) {
            const parts = path.split('/novels/');
            if (parts.length > 1) {
                resolved = FileSystem.documentDirectory + 'novels/' + parts[1];
            }
        }
        // Ensure it has file:// prefix if it's an absolute path starting with /
        if (typeof resolved === 'string' && resolved.startsWith('/') && !resolved.startsWith('file://')) {
            resolved = 'file://' + resolved;
        }
        return resolved;
    };

    const changeZoomRatio = async (ratio) => {
        setZoomRatio(ratio);
        await AsyncStorage.setItem('@comic_zoom_ratio', ratio.toString());
    };

    const renderPage = ({ item: rawItem, index }) => {
        const item = resolveLocalPath(rawItem);
        const isBoylove = novelId.includes('香香腐宅');
        const is18comic = novelId.includes('18comic');
        
        // Use chapter-specific scrambled flag if available, otherwise fallback to novel's flag
        const autoDescramble = is18comic && !novel?.isDescrambled;
        const autoDescrambleBoylove = chapterIsScrambled !== undefined ? chapterIsScrambled : (novel?.isDescrambled === false);
        
        let needsDescrambling = false;
        if (descrambleOverride === 'on') {
            needsDescrambling = true;
        } else if (descrambleOverride === 'off') {
            needsDescrambling = false;
        } else {
            needsDescrambling = isBoylove ? autoDescrambleBoylove : autoDescramble;
        }
        
        const handleImageErrorRetry = () => {
            Alert.alert(
                '圖片載入失敗',
                '是否要重新下載本章節？',
                [
                    { text: '取消', style: 'cancel' },
                    { text: '重新下載', onPress: () => {
                        retryChapterDownload(novelId, currentChapterIndex);
                        navigation.goBack();
                    }}
                ]
            );
        };
        
        const imageContent = (
            <TouchableWithoutFeedback onPress={(e) => handleImageTap(e, index)}>
                <View style={{ width, justifyContent: 'center', alignItems: 'center' }}>
                    {(isBoylove && needsDescrambling) ? (
                        <BoyloveImage
                            uri={item}
                            screenWidth={width}
                            screenHeight={height}
                            needsDescrambling={needsDescrambling}
                            onRetry={handleImageErrorRetry}
                        />
                    ) : needsDescrambling ? (
                        <ScrambledImage 
                            uri={item} 
                            novelId={novelId} 
                            isHorizontal={isHorizontal} 
                            screenHeight={height} 
                            screenWidth={width}
                            algorithmMode={algorithmMode > 0 ? algorithmMode : 0}
                        />
                    ) : (
                        <AutoHeightImage 
                            uri={item} 
                            screenWidth={width} 
                            isHorizontal={isHorizontal} 
                            screenHeight={height}
                            onRetry={handleImageErrorRetry}
                        />
                    )}
                </View>
            </TouchableWithoutFeedback>
        );

        if (isHorizontal) {
            return (
                <ScrollView
                    ref={ref => { 
                        if (ref) {
                            horizontalScrollRefs.current[index] = ref;
                        } else {
                            delete horizontalScrollRefs.current[index];
                        }
                    }}
                    onScroll={(e) => {
                        if (e.nativeEvent.zoomScale !== undefined) {
                            horizontalZoomScale.current[index] = e.nativeEvent.zoomScale;
                        }
                    }}
                    scrollEventThrottle={16}
                    maximumZoomScale={zoomRatio}
                    minimumZoomScale={1}
                    bouncesZoom={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    style={{ width, height }}
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
                >
                    {imageContent}
                </ScrollView>
            );
        }

        // Vertical mode: just return the image content bare.
        // The whole FlatList is wrapped in a single ZoomableView below.
        return imageContent;
    };

    if (!novel) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

    return (
        <View style={[styles.container, { backgroundColor: '#000' }]}>
            {/* Header */}
            {showHeader && (
                <BlurView intensity={80} tint="dark" style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                        <Feather name="arrow-left" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{novel.title}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setShowTOC(true)} style={[styles.iconBtn, { marginRight: 15 }]}>
                            <Feather name="list" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={showZoomSettings} style={[styles.iconBtn, { marginRight: 15 }]}>
                            <Feather name="settings" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsHorizontal(!isHorizontal)} style={styles.iconBtn}>
                            <Feather name={isHorizontal ? "list" : "book-open"} size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </BlurView>
            )}

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : pages.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <Feather name="alert-circle" size={48} color="#888" />
                    <Text style={{ color: '#aaa', marginTop: 16, fontSize: 16 }}>無內容</Text>
                    <Text style={{ color: '#666', marginTop: 8, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
                        此漫畫可能需要重新下載。請先在保險庫長按刪除，再從總覽重新下載。
                    </Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: colors.primary, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>返回</Text>
                    </TouchableOpacity>
                </View>
            ) : isHorizontal ? (
                <FlatList
                    key={`horizontal-${algorithmMode}-${descrambleOverride}`}
                    ref={flatListRef}
                    data={pages}
                    keyExtractor={(item, index) => index.toString()}
                    extraData={{ algorithmMode, descrambleOverride }}
                    horizontal={true}
                    pagingEnabled={true}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    renderItem={renderPage}
                    getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={2}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    ListEmptyComponent={
                        isLoading ? null : (
                            <View style={{ width, height, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                                <Text style={{ color: '#fff', fontSize: 18, marginBottom: 10 }}>沒有找到任何頁面資料</Text>
                                <Text style={{ color: '#888', fontSize: 12 }}>ID: {novelId}</Text>
                                <Text style={{ color: '#888', fontSize: 12 }}>Pages Array Length: {pages.length}</Text>
                                <Text style={{ color: '#888', fontSize: 12, marginTop: 10, paddingHorizontal: 20, textAlign: 'center' }}>如果圖片存在於空間管理中，代表章節資料 (JSON) 可能損毀或無法正確關聯。</Text>
                            </View>
                        )
                    }
                />
            ) : (
                // Vertical mode: native ScrollView with maximumZoomScale.
                // iOS/Android native zoom supports free panning in ALL directions after zooming.
                // No gesture conflicts — this is the same mechanism as Safari/Photos.
                <ScrollView
                    ref={scrollViewRef}
                    style={{ flex: 1, width }}
                    scrollEventThrottle={16}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    maximumZoomScale={zoomRatio}
                    minimumZoomScale={1}
                    bouncesZoom={true}
                    centerContent={true}
                    onScroll={(e) => {
                        scrollY.current = e.nativeEvent.contentOffset.y;
                        scrollX.current = e.nativeEvent.contentOffset.x;
                        if (e.nativeEvent.zoomScale !== undefined) {
                            currentZoom.current = e.nativeEvent.zoomScale;
                        }
                    }}
                >
                    <View>
                        {pages.map((rawItem, index) => (
                            <View key={index}>
                                {renderPage({ item: rawItem, index })}
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}

            {/* Footer */}
            {showHeader && (
                <BlurView intensity={80} tint="dark" style={styles.footer}>
                    <TouchableOpacity 
                        disabled={currentChapterIndex === 0}
                        onPress={() => loadChapter(currentChapterIndex - 1)}
                    >
                        <Feather name="chevron-left" size={28} color={currentChapterIndex === 0 ? '#555' : '#fff'} />
                    </TouchableOpacity>
                    <Text style={styles.footerText}>
                        {novel.chapters[currentChapterIndex]?.title}
                    </Text>
                    <TouchableOpacity 
                        disabled={currentChapterIndex === novel.chapters.length - 1}
                        onPress={() => loadChapter(currentChapterIndex + 1)}
                    >
                        <Feather name="chevron-right" size={28} color={currentChapterIndex === novel.chapters.length - 1 ? '#555' : '#fff'} />
                    </TouchableOpacity>
                </BlurView>
            )}

            {/* TOC Modal */}
            <Modal visible={showTOC} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>目錄</Text>
                                {isVault && (
                                    <TouchableOpacity 
                                        style={[styles.iconBtn, { marginLeft: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF9500', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }]}
                                        onPress={handleRetryFailedChapters}
                                    >
                                        <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 4 }} />
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>修復失敗</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => setShowTOC(false)} style={styles.iconBtn}>
                                <Feather name="x" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={novel.chapters}
                            keyExtractor={(item, idx) => idx.toString()}
                            renderItem={({ item, index }) => (
                                <TouchableOpacity 
                                    style={[styles.tocItem, index === currentChapterIndex && styles.tocItemActive, { borderBottomColor: colors.border }]}
                                    onPress={() => {
                                        setShowTOC(false);
                                        if (index !== currentChapterIndex) {
                                            loadChapter(index);
                                        }
                                    }}
                                    onLongPress={() => {
                                        if (isVault) {
                                            setSelectedChapterForOptions(index);
                                            setShowOptionsModal(true);
                                        }
                                    }}
                                >
                                    <Text style={[styles.tocItemText, { color: colors.text }, index === currentChapterIndex && { color: colors.primary, fontWeight: 'bold' }]}>
                                        {item.title}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
            <Modal visible={showOptionsModal} transparent={true} animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowOptionsModal(false)}>
                    <View style={[styles.optionsContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.optionsTitle, { color: colors.textSecondary }]}>
                            {selectedChapterForOptions !== null && novel.chapters[selectedChapterForOptions] ? novel.chapters[selectedChapterForOptions].title : ''}
                        </Text>
                        
                        <TouchableOpacity style={[styles.modalOption, { borderBottomColor: colors.border }]} onPress={() => {
                            setShowOptionsModal(false);
                            setShowTOC(false);
                            retryChapterDownload(novelId, selectedChapterForOptions);
                            navigation.goBack();
                        }}>
                            <Feather name="refresh-cw" size={20} color="#FF9500" />
                            <Text style={[styles.modalOptionText, { color: '#FF9500' }]}>重新下載此章節</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 90,
        paddingTop: 45,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10
    },
    iconBtn: { padding: 5 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    footer: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 80,
        paddingBottom: 20,
        paddingHorizontal: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10
    },
    footerText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold'
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        height: '70%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold'
    },
    tocItem: {
        paddingVertical: 15,
        borderBottomWidth: 1
    },
    tocItemActive: {
        backgroundColor: 'rgba(255,255,255,0.05)'
    },
    tocItemText: {
        fontSize: 16
    },
    optionsContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20
    },
    optionsTitle: {
        fontSize: 14,
        marginBottom: 15,
        textAlign: 'center'
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1
    },
    modalOptionText: {
        fontSize: 16,
        marginLeft: 10
    }
});
