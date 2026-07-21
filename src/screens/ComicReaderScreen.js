import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, ScrollView, Image, TouchableWithoutFeedback, LayoutAnimation, UIManager, Platform, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getChapterText, getNovelById, updateReadingProgress, saveChapterText, addReadingTime } from '../utils/storage';
import { getDictionaries } from '../utils/dictionaryStorage';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import ScrambledImage from '../components/ScrambledImage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AutoHeightImage = ({ uri, screenWidth, isHorizontal, screenHeight }) => {
    const [imgHeight, setImgHeight] = useState(screenWidth / 0.7);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    if (error) {
        return (
            <TouchableOpacity onPress={async () => {
                try {
                    const info = await FileSystem.getInfoAsync(uri);
                    Alert.alert('檔案資訊', `存在 (Exists): ${info.exists}\n大小 (Size): ${info.size}\n\n路徑: ${info.uri}`);
                } catch (e) {
                    Alert.alert('檢查失敗', `錯誤訊息: ${e.message}\n\nURI 型別: ${typeof uri}\nURI 內容: ${JSON.stringify(uri)}`);
                }
            }}>
                <View style={{ width: screenWidth, minHeight: 300, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' }}>
                    <Text style={{ color: '#ff4444', fontSize: 16, fontWeight: 'bold' }}>圖片載入失敗 (點擊檢查檔案)</Text>
                    <Text style={{ color: '#aaa', fontSize: 10, marginTop: 8, paddingHorizontal: 10, textAlign: 'center' }}>{uri}</Text>
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
            {/* Debug Overlay */}
            <Text style={{ position: 'absolute', top: 5, left: 5, color: 'rgba(255,255,255,0.3)', fontSize: 8, maxWidth: screenWidth - 10 }} numberOfLines={2}>
                {uri}
            </Text>
        </View>
    );
};

export default function ComicReaderScreen({ route, navigation }) {
    const { novelId, title } = route.params;
    const { colors, isDark } = useTheme();

    const [novel, setNovel] = useState(null);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [pages, setPages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI state
    const [isHorizontal, setIsHorizontal] = useState(false);
    const [showHeader, setShowHeader] = useState(true);
    const [algorithmMode, setAlgorithmMode] = useState(0);

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
                loadChapter(0, data);
            } else {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, []);

    const loadChapter = async (index, novelData) => {
        setIsLoading(true);
        setCurrentChapterIndex(index);
        const data = novelData || novel;
        
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
            } else {
                setPages([]);
            }
        } catch (e) {
            setPages([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageTap = (e, index) => {
        const now = Date.now();
        if (now - lastTap.current < 500) { // Increased double tap threshold to 500ms
            // Double tap
            const tapX = e.nativeEvent.pageX;
            const tapY = e.nativeEvent.pageY;
            const Z_target = zoomRatio;

            if (isHorizontal) {
                const responder = horizontalScrollRefs.current[index]?.getScrollResponder?.() || horizontalScrollRefs.current[index];
                if (responder && responder.scrollResponderZoomTo) {
                    const Z_c = horizontalZoomScale.current[index] || 1;
                    if (Z_c > 1.1) {
                        responder.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
                    } else {
                        const targetWidth = width / Z_target;
                        const targetHeight = height / Z_target;
                        responder.scrollResponderZoomTo({ x: tapX - targetWidth/2, y: tapY - targetHeight/2, width: targetWidth, height: targetHeight, animated: true });
                    }
                }
            } else {
                if (flatListRef.current) {
                    const responder = flatListRef.current.getScrollResponder();
                    if (responder && responder.scrollResponderZoomTo) {
                        const Z_c = currentZoom.current || 1;
                        if (Z_c > 1.1) {
                            // Zoom out to 1x around the focal point
                            const unzoomedTapX = (scrollX.current + tapX) / Z_c;
                            const unzoomedTapY = (scrollY.current + tapY) / Z_c;
                            const x = unzoomedTapX - tapX;
                            let y = unzoomedTapY - tapY;
                            if (y < 0) y = 0; // Prevent scrolling out of bounds
                            responder.scrollResponderZoomTo({ x, y, width, height, animated: true });
                        } else {
                            // Zoom in to Z_target around the focal point
                            const unzoomedTapX = scrollX.current + tapX; // Z_c is 1
                            const unzoomedTapY = scrollY.current + tapY;
                            const targetWidth = width / Z_target;
                            const targetHeight = height / Z_target;
                            const x = unzoomedTapX - tapX / Z_target;
                            let y = unzoomedTapY - tapY / Z_target;
                            if (y < 0) y = 0;
                            responder.scrollResponderZoomTo({ x, y, width: targetWidth, height: targetHeight, animated: true });
                        }
                    }
                }
            }
            lastTap.current = 0;
        } else {
            lastTap.current = now;
            // Only trigger header toggle if another tap doesn't happen within 300ms (to prevent header flicker on double tap)
            setTimeout(() => {
                if (lastTap.current === now) {
                    toggleHeaderRef.current();
                }
            }, 300);
        }
    };
    
    const showZoomSettings = () => {
        Alert.alert('設定', '請選擇設定項目', [
            { text: '設定放大倍率', onPress: () => {
                Alert.alert('設定放大倍率', '請選擇雙擊後的放大倍率', [
                    { text: '1.5 倍', onPress: () => changeZoomRatio(1.5) },
                    { text: '2.0 倍', onPress: () => changeZoomRatio(2.0) },
                    { text: '2.5 倍', onPress: () => changeZoomRatio(2.5) },
                    { text: '3.0 倍', onPress: () => changeZoomRatio(3.0) },
                    { text: '取消', style: 'cancel' }
                ]);
            }},
            { text: '切換解析算法 (除錯用)', onPress: () => {
                const nextMode = (algorithmMode + 1) % 4;
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
        const imageContent = (
            <TouchableWithoutFeedback onPress={(e) => handleImageTap(e, index)}>
                <View style={{ width, justifyContent: 'center', alignItems: 'center' }}>
                    {novel?.isDescrambled ? (
                        <AutoHeightImage 
                            uri={item} 
                            screenWidth={width} 
                            isHorizontal={isHorizontal} 
                            screenHeight={height} 
                        />
                    ) : (
                        <ScrambledImage 
                            uri={item} 
                            novelId={novelId} 
                            isHorizontal={isHorizontal} 
                            screenHeight={height} 
                            screenWidth={width}
                            algorithmMode={algorithmMode}
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

        // Vertical mode
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
                    ref={flatListRef}
                    data={pages}
                    keyExtractor={(item, index) => index.toString()}
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
                <ScrollView
                    ref={scrollViewRef}
                    onScroll={(e) => {
                        scrollY.current = e.nativeEvent.contentOffset.y;
                        scrollX.current = e.nativeEvent.contentOffset.x;
                        if (e.nativeEvent.zoomScale !== undefined) {
                            currentZoom.current = e.nativeEvent.zoomScale;
                        }
                    }}
                    scrollEventThrottle={16}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1, width: width }}
                    removeClippedSubviews={Platform.OS === 'android'}
                >
                    {pages.map((p, index) => (
                        <React.Fragment key={index}>
                            {renderPage({ item: p, index })}
                        </React.Fragment>
                    ))}
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
    }
});
