import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getWyblogsArticles, refreshWyblogsFeed, fetchWyblogsArticleContent } from '../utils/wyblogsFeedService';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';
import { convertS2T } from '../utils/opencc';
import { splitTextIntoChapters } from '../utils/parserUtils';

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

    useEffect(() => {
        loadFeed();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadDownloadedIds();
        }, [])
    );

    const loadDownloadedIds = async () => {
        try {
            const list = await getBookshelf();
            const wyblogsIds = list
                .filter(n => n.id.startsWith('blog_wyblogs_'))
                .map(n => n.id.replace('blog_wyblogs_', ''));
            setDownloadedIds(new Set(wyblogsIds));
        } catch (e) {}
    };

    const loadFeed = async () => {
        try {
            setIsLoading(true);
            setFetchProgress(0);
            setFetchText('準備獲取小說目錄...');
            const result = await getWyblogsArticles((loaded, total) => {
                setFetchProgress(loaded / total);
                setFetchText(`正在獲取第 ${loaded} / ${total} 頁...`);
            });
            setArticles(result.articles);
            setLastUpdated(result.lastUpdated);
            extractCategories(result.articles);
        } catch (e) {
            Alert.alert('載入失敗', '無法載入小說目錄：' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        try {
            setIsRefreshing(true);
            setFetchProgress(0);
            setFetchText('準備更新小說目錄...');
            const freshArticles = await refreshWyblogsFeed((loaded, total) => {
                setFetchProgress(loaded / total);
                setFetchText(`正在獲取第 ${loaded} / ${total} 頁...`);
            });
            setArticles(freshArticles);
            setLastUpdated(Date.now());
            extractCategories(freshArticles);
            Alert.alert('更新完成', `已載入 ${freshArticles.length} 篇小說`);
        } catch (e) {
            Alert.alert('更新失敗', '無法連線至 wyblogs：' + e.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const extractCategories = (articleList) => {
        const catSet = new Set();
        articleList.forEach(a => a.categories.forEach(c => catSet.add(c)));
        const sorted = [...catSet].sort();
        setAllCategories(sorted);
    };

    const handleDownload = async (article) => {
        if (downloadingId) return;
        setDownloadingId(article.id);

        try {
            let text = await fetchWyblogsArticleContent(article.url);
            text = convertS2T(text);

            const novelId = 'blog_wyblogs_' + article.id;
            const chapterTitle = convertS2T(article.title);

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
                url: article.url,
                chapters: newChaptersData.map(c => ({ title: c.title, url: article.url })),
                chapterCount: newChaptersData.length,
                downloadedChapters: newChaptersData.length,
                folderId: 'vault',
                isHidden: true,
            };

            await saveNovelToBookshelf(novelInfo);

            const newSet = new Set(downloadedIds);
            newSet.add(article.id);
            setDownloadedIds(newSet);

            Alert.alert('下載完成', `《${chapterTitle}》已加入金庫！`);
        } catch (e) {
            Alert.alert('下載失敗', e.message);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleArticlePress = (article) => {
        if (downloadedIds.has(article.id)) {
            const novelId = 'blog_wyblogs_' + article.id;
            navigation.navigate('Reader', { novelId, title: article.title });
        } else {
            Alert.alert(
                convertS2T(article.title),
                '要下載這篇小說嗎？',
                [
                    { text: '取消', style: 'cancel' },
                    { text: '下載', onPress: () => handleDownload(article) }
                ]
            );
        }
    };

    const filteredArticles = articles.filter(a => {
        if (selectedCategory && !a.categories.includes(selectedCategory)) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return a.title.toLowerCase().includes(q);
        }
        return true;
    });

    const formatLastUpdated = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const renderArticle = ({ item }) => {
        const isDownloaded = downloadedIds.has(item.id);
        const isDownloading = downloadingId === item.id;

        return (
            <TouchableOpacity
                style={[styles.articleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleArticlePress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.articleContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>
                            {convertS2T(item.title)}
                        </Text>
                        <View style={styles.tagsRow}>
                            {item.categories.slice(0, 3).map((cat, idx) => (
                                <View key={idx} style={[styles.tagBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                    <Text style={[styles.tagText, { color: colors.primary }]}>{cat}</Text>
                                </View>
                            ))}
                            {item.categories.length > 3 && (
                                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>+{item.categories.length - 3}</Text>
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
    };

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
                    keyExtractor={item => item.id}
                    renderItem={renderArticle}
                    contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
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
