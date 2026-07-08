import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, ScrollView, Image, TouchableWithoutFeedback } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getNovelById, getChapterText } from '../utils/storage';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import ScrambledImage from '../components/ScrambledImage';

const { width, height } = Dimensions.get('window');

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

    useEffect(() => {
        const loadInitialData = async () => {
            const data = await getNovelById(novelId);
            setNovel(data);
            
            if (data && data.chapterCount > 0) {
                // Determine starting chapter (can implement progress later)
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
            // saveComicChapterData saves with index (0, 1, 2...) as the fileId
            const chapterData = await getChapterText(novelId, index.toString());
            console.log('Chapter data for index', index, ':', chapterData ? 'found, pages=' + (chapterData.pages ? chapterData.pages.length : 0) : 'null');
            if (chapterData && chapterData.pages && chapterData.pages.length > 0) {
                setPages(chapterData.pages);
            } else {
                console.warn('No pages found for chapter', index);
                setPages([]);
            }
        } catch (e) {
            console.warn('Failed to load chapter pages', e);
            setPages([]);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleHeader = () => setShowHeader(!showHeader);
    
    const renderPage = ({ item, index }) => {
        const imageContent = (
            <TouchableWithoutFeedback onPress={toggleHeader}>
                <View>
                    <ScrambledImage 
                        uri={item} 
                        novelId={novelId} 
                        isHorizontal={isHorizontal} 
                        screenHeight={height} 
                        screenWidth={width} 
                    />
                </View>
            </TouchableWithoutFeedback>
        );

        if (isHorizontal) {
            return (
                <ScrollView
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    bouncesZoom={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
                    style={{ width, height }}
                >
                    {imageContent}
                </ScrollView>
            );
        }

        // Vertical mode: no nested ScrollView to avoid gesture conflicts
        return (
            <View style={{ width, alignItems: 'center' }}>
                {imageContent}
            </View>
        );
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
                    <TouchableOpacity onPress={() => setIsHorizontal(!isHorizontal)} style={styles.iconBtn}>
                        <Feather name={isHorizontal ? "list" : "book-open"} size={20} color="#fff" />
                    </TouchableOpacity>
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
            ) : (
                <FlatList
                    data={pages}
                    keyExtractor={(item, index) => index.toString()}
                    horizontal={isHorizontal}
                    pagingEnabled={isHorizontal}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    renderItem={renderPage}
                    getItemLayout={(data, index) => (
                        { length: isHorizontal ? width : height, offset: (isHorizontal ? width : height) * index, index }
                    )}
                />
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
        fontSize: 16,
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
