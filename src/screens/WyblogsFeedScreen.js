import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getWyblogsArticles, refreshWyblogsFeed, fetchWyblogsArticleContent } from '../utils/wyblogsFeedService';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';
import { convertS2T } from '../utils/opencc';
import { splitTextIntoChapters } from '../utils/parserUtils';

const formatLastUpdated = (ts) => {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
        return '';
    }
};

export default function WyblogsFeedScreen({ navigation }) {
    const { colors, isDark } = useTheme();

    const [articles, setArticles] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [downloadedIds, setDownloadedIds] = useState(new Set());
    
    // Progress state
    const [fetchProgress, setFetchProgress] = useState(0);
    const [fetchText, setFetchText] = useState('');

    // Category filter
    const [allCategories, setAllCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        loadFeed();
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadDownloadedIds = useCallback(async () => {
        try {
            const list = await getBookshelf();
            if (!Array.isArray(list)) return;
            const wyblogsIds = list
                .filter(n => n?.id && typeof n.id === 'string' && n.id.startsWith('blog_wyblogs_'))
                .map(n => n.id.replace('blog_wyblogs_', ''));
            if (isMountedRef.current) {
                setDownloadedIds(new Set(wyblogsIds));
            }
        } catch (e) {
            console.warn('Failed to load downloaded wyblogs ids:', e);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadDownloadedIds();
        }, [loadDownloadedIds])
    );

    const extractCategories = useCallback((articleList) => {
        const catSet = new Set();
        (articleList || []).forEach(a => {
            (a?.categories || []).forEach(c => {
                if (c) catSet.add(c);
            });
        });
        const sorted = [...catSet].sort();
        setAllCategories(sorted);
    }, []);

    const loadFeed = useCallback(async () => {
        try {
            if (isMountedRef.current) {
                setIsLoading(true);
                setFetchProgress(0);
                setFetchText('準備獲取小說目錄...');
            }
            const result = await getWyblogsArticles((loaded, total) => {
                if (isMountedRef.current && total > 0) {
                    setFetchProgress(loaded / total);
                    setFetchText(`正在獲取第 ${loaded} / ${total} 頁...`);
                }
            });
            if (isMountedRef.current && result) {
                const articleList = Array.isArray(result.articles) ? result.articles : [];
                setArticles(articleList);
                setLastUpdated(result.lastUpdated || null);
                extractCategories(articleList);
            }
        } catch (e) {
            if (isMountedRef.current) {
                Alert.alert('載入失敗', '無法載入小說目錄：' + (e?.message || '未知錯誤'));
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [extractCategories]);

    const handleRefresh = useCallback(async () => {
        try {
            setIsRefreshing(true);
            setFetchProgress(0);
            setFetchText('準備更新小說目錄...');
            const freshArticles = await refreshWyblogsFeed((loaded, total) => {
                if (isMountedRef.current && total > 0) {
                    setFetchProgress(loaded / total);
                    setFetchText(`正在獲取第 ${loaded} / ${total} 頁...`);
                }
            });
            if (isMountedRef.current) {
                const safeArticles = Array.isArray(freshArticles) ? freshArticles : [];
                setArticles(safeArticles);
                setLastUpdated(Date.now());
                extractCategories(safeArticles);
                Alert.alert('更新完成', `已載入 ${safeArticles.length} 篇小說`);
            }
        } catch (e) {
            if (isMountedRef.current) {
                Alert.alert('更新失敗', '無法連線至 wyblogs：' + (e?.message || '未知錯誤'));
            }
        } finally {
            if (isMountedRef.current) {
                setIsRefreshing(false);
            }
        }
    }, [extractCategories]);

    const handleDownload = useCallback(async (article) => {
        if (!article?.id || downloadingId) return;
        setDownloadingId(article.id);

        try {
            let text = await fetchWyblogsArticleContent(article.url);
            text = convertS2T(text);

            const novelId = 'blog_wyblogs_' + article.id;
            const chapterTitle = convertS2T(article.title || '無標題');

            let newChaptersData = [];
            try {
                newChaptersData = splitTextIntoChapters(text, 'regex', '第[零一二三四五六七八九十百千0-9]+[章節][^\\n]*', chapterTitle);
            } catch (e) {
                newChaptersData = [{ title: chapterTitle, text: text }];
            }

            for (let i = 0; i < newChaptersData.length; i++) {
                await saveChapterText(novelId, i, newChaptersData[i].title, newChaptersData[i].text);
            }

            const novelInfo = {
                id: novelId,
                title: chapterTitle,
                author: 'wyblogs',
                cover: '',
                url: article.url || '',
                chapters: (newChaptersData || []).map(c => ({ title: c.title, url: article.url || '' })),
                chapterCount: newChaptersData.length,
                downloadedChapters: newChaptersData.length,
                folderId: 'vault',
                isHidden: true,
            };

            await saveNovelToBookshelf(novelInfo);

            setDownloadedIds(prev => {
                const next = new Set(prev);
                next.add(article.id);
                return next;
            });

            Alert.alert('下載完成', `《${chapterTitle}》已加入金庫！`);
        } catch (e) {
            Alert.alert('下載失敗', e?.message || '未知錯誤');
        } finally {
            if (isMountedRef.current) {
                setDownloadingId(null);
            }
        }
    }, [downloadingId]);

    const handleArticlePress = useCallback((article) => {
        if (!article?.id) return;
        if (downloadedIds.has(article.id)) {
            const novelId = 'blog_wyblogs_' + article.id;
            navigation.navigate('Reader', { novelId, title: article.title || '' });
        } else {
            Alert.alert(
                convertS2T(article.title || '小說'),
                '要下載這篇小說嗎？',
                [
                    { text: '取消', style: 'cancel' },
                    { text: '下載', onPress: () => handleDownload(article) }
                ]
            );
        }
    }, [downloadedIds, navigation, handleDownload]);

    const filteredArticles = useMemo(() => {
        const q = searchQuery ? searchQuery.trim().toLowerCase() : '';
        return articles.filter(a => {
            if (selectedCategory && (!Array.isArray(a?.categories) || !a.categories.includes(selectedCategory))) {
                return false;
            }
            if (q) {
                const titleStr = (a?.title || '').toLowerCase();
                return titleStr.includes(q);
            }
            return true;
        });
    }, [articles, selectedCategory, searchQuery]);

    const keyExtractor = useCallback(item => item?.id || String(Math.random()), []);

    const renderArticle = useCallback(({ item }) => {
        if (!item) return null;
        const isDownloaded = downloadedIds.has(item.id);
        const isDownloading = downloadingId === item.id;
        const categories = Array.isArray(item.categories) ? item.categories : [];

        return (
            <TouchableOpacity
                style={[styles.articleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleArticlePress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.articleContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>
                            {convertS2T(item.title || '(無標題)')}
                        </Text>
                        <View style={styles.tagsRow}>
                            {categories.slice(0, 3).map((cat, idx) => (
                                <View key={idx} style={[styles.tagBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                    <Text style={[styles.tagText, { color: colors.primary }]}>{cat}</Text>
                                </View>
                            ))}
                            {categories.length > 3 && (
                                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>+{categories.length - 3}</Text>
                            )}
                        </View>
                    </View>
                    <View style={styles.actionArea}>
                        {isDownloading ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : isDownloaded ? (
                            <View style={[styles.downloadedBadge, { backgroundColor: colors.primary }]}>
                                <Feather name="check" size={16} color="#fff" />
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[styles.downloadBtn, { borderColor: colors.primary }]}
                                onPress={() => handleDownload(item)}
                            >
                                <Feather name="download" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }, [colors, isDark, downloadedIds, downloadingId, handleArticlePress, handleDownload]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header Info Bar */}
            <View style={[styles.infoBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.infoTitle, { color: colors.text }]}>Wyblogs 小說</Text>
                    <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>
                        {articles.length} 篇小說 {lastUpdated ? `· 更新於 ${formatLastUpdated(lastUpdated)}` : ''}
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.refreshBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={handleRefresh}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <Feather name="refresh-cw" size={18} color={colors.primary} />
                    )}
                </TouchableOpacity>
            </View>

            {/* Refresh Progress Bar */}
            {(isRefreshing && fetchProgress > 0) && (
                <View style={[styles.refreshProgressContainer, { borderBottomColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }]}>
                    <Text style={{ fontSize: 12, color: colors.primary, marginBottom: 6, fontWeight: 'bold' }}>{fetchText}</Text>
                    <View style={[styles.progressBarBg, { width: '100%', marginTop: 0 }]}>
                        <View style={[styles.progressBarFill, { width: `${fetchProgress * 100}%`, backgroundColor: colors.primary }]} />
                    </View>
                </View>
            )}

            {/* Search Bar */}
            <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
                <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                    <Feather name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="搜尋小說名稱..."
                        placeholderTextColor={colors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Feather name="x" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Category Filter Bar */}
            {allCategories.length > 0 && (
                <View style={[styles.tagFilterContainer, { borderBottomColor: colors.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagFilterContent}>
                        <TouchableOpacity
                            style={[
                                styles.filterChip,
                                { borderColor: colors.border },
                                !selectedCategory && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setSelectedCategory(null)}
                        >
                            <Text style={[styles.filterChipText, { color: !selectedCategory ? '#fff' : colors.text }]}>全部</Text>
                        </TouchableOpacity>
                        {allCategories.map(cat => (
                            <TouchableOpacity
                                key={cat}
                                style={[
                                    styles.filterChip,
                                    { borderColor: colors.border },
                                    selectedCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary }
                                ]}
                                onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                            >
                                <Text style={[styles.filterChipText, { color: selectedCategory === cat ? '#fff' : colors.text }]}>{cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Article List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{fetchText || '載入小說目錄中...'}</Text>
                    {fetchProgress > 0 && (
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${fetchProgress * 100}%`, backgroundColor: colors.primary }]} />
                        </View>
                    )}
                </View>
            ) : (
                <FlatList
                    data={filteredArticles}
                    keyExtractor={keyExtractor}
                    renderItem={renderArticle}
                    contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
                    maxToRenderPerBatch={10}
                    windowSize={7}
                    initialNumToRender={10}
                    removeClippedSubviews={Platform.OS === 'android'}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Feather name="inbox" size={48} color={colors.textSecondary} style={{ marginBottom: 16 }} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {searchQuery ? `找不到「${searchQuery}」相關的小說` : selectedCategory ? `「${selectedCategory}」分類下沒有小說` : '沒有找到小說'}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    infoBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    infoTitle: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    infoSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    refreshBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    tagFilterContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 10,
    },
    tagFilterContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    articleCard: {
        marginHorizontal: 16,
        marginVertical: 5,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    articleContent: {
        flexDirection: 'row',
        padding: 14,
        alignItems: 'center',
    },
    articleTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
        lineHeight: 22,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 4,
        alignItems: 'center',
    },
    tagBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    tagText: {
        fontSize: 11,
        fontWeight: '600',
    },
    actionArea: {
        marginLeft: 12,
        justifyContent: 'center',
        alignItems: 'center',
        width: 40,
    },
    downloadBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    downloadedBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressBarBg: {
        width: 200,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(150,150,150,0.2)',
        marginTop: 16,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    refreshProgressContainer: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
    },
    emptyText: {
        fontSize: 15,
        textAlign: 'center',
    },
});
