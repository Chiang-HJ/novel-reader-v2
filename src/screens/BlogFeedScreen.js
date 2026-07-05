import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';
import { getArticles, refreshFeed, fetchArticleContent } from '../utils/blogFeedService';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';
import { convertS2T } from '../utils/opencc';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DOWNLOADED_IDS_KEY = '@blog_downloaded_ids';

export default function BlogFeedScreen({ navigation }) {
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

    // Tag filter
    const [allTags, setAllTags] = useState([]);
    const [selectedTag, setSelectedTag] = useState(null);

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
            const yulujiIds = list
                .filter(n => n.id.startsWith('blog_yuluji_'))
                .map(n => n.id.replace('blog_yuluji_', ''));
            setDownloadedIds(new Set(yulujiIds));
        } catch (e) {}
    };

    const saveDownloadedId = async (id) => {
        const newSet = new Set(downloadedIds);
        newSet.add(id);
        setDownloadedIds(newSet);
    };

    const loadFeed = async () => {
        try {
            setIsLoading(true);
            setFetchProgress(0);
            setFetchText('準備獲取文章...');
            const result = await getArticles((loaded, total) => {
                setFetchProgress(loaded / total);
                setFetchText(`正在獲取 ${loaded} / ${total}...`);
            });
            setArticles(result.articles);
            setLastUpdated(result.lastUpdated);
            extractTags(result.articles);
        } catch (e) {
            Alert.alert('載入失敗', '無法載入文章列表：' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        try {
            setIsRefreshing(true);
            setFetchProgress(0);
            setFetchText('準備獲取文章...');
            const freshArticles = await refreshFeed((loaded, total) => {
                setFetchProgress(loaded / total);
                setFetchText(`正在獲取 ${loaded} / ${total}...`);
            });
            setArticles(freshArticles);
            setLastUpdated(Date.now());
            extractTags(freshArticles);
            Alert.alert('更新完成', `已載入 ${freshArticles.length} 篇文章`);
        } catch (e) {
            Alert.alert('更新失敗', '無法連線至語錄集：' + e.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const extractTags = (articleList) => {
        const tagSet = new Set();
        articleList.forEach(a => a.tags.forEach(t => tagSet.add(t)));
        const sorted = [...tagSet].sort();
        setAllTags(sorted);
    };

    const handleDownload = async (article) => {
        if (downloadingId) return;
        setDownloadingId(article.id);

        try {
            // Fetch and parse the article content
            let text = await fetchArticleContent(article.url);
            
            // Convert simplified to traditional Chinese
            text = convertS2T(text);

            const novelId = 'blog_yuluji_' + article.id;
            const chapterTitle = article.title;

            // Save as a single-chapter novel
            await saveChapterText(novelId, 0, chapterTitle, text);

            const novelInfo = {
                id: novelId,
                title: convertS2T(article.title),
                author: '語錄集',
                cover: '',
                url: article.url,
                chapters: [{ title: chapterTitle, url: article.url }],
                chapterCount: 1,
                downloadedChapters: 1,
                folderId: 'vault',
                isHidden: true,
            };

            await saveNovelToBookshelf(novelInfo);
            await saveDownloadedId(article.id);

            Alert.alert('下載完成', `《${convertS2T(article.title)}》已加入書架！`);
        } catch (e) {
            Alert.alert('下載失敗', e.message);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleArticlePress = (article) => {
        if (downloadedIds.has(article.id)) {
            const novelId = 'blog_yuluji_' + article.id;
            navigation.navigate('Reader', { novelId, title: article.title });
        } else {
            Alert.alert(
                article.title,
                article.summary ? article.summary.substring(0, 200) + '...' : '要下載這篇文章嗎？',
                [
                    { text: '取消', style: 'cancel' },
                    { text: '下載', onPress: () => handleDownload(article) }
                ]
            );
        }
    };

    const filteredArticles = selectedTag
        ? articles.filter(a => a.tags.includes(selectedTag))
        : articles;

    const formatDate = (isoStr) => {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
        } catch {
            return '';
        }
    };

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
                            {item.title}
                        </Text>
                        <View style={styles.tagsRow}>
                            {item.tags.slice(0, 3).map((tag, idx) => (
                                <View key={idx} style={[styles.tagBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                    <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                                </View>
                            ))}
                            {item.tags.length > 3 && (
                                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>+{item.tags.length - 3}</Text>
                            )}
                        </View>
                        <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                            {formatDate(item.publishedAt)}
                        </Text>
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
                    <Text style={[styles.infoTitle, { color: colors.text }]}>語錄集</Text>
                    <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>
                        {articles.length} 篇文章 {lastUpdated ? `· 更新於 ${formatLastUpdated(lastUpdated)}` : ''}
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

            {/* Tag Filter Bar */}
            {allTags.length > 0 && (
                <View style={[styles.tagFilterContainer, { borderBottomColor: colors.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagFilterContent}>
                        <TouchableOpacity
                            style={[
                                styles.filterChip,
                                { borderColor: colors.border },
                                !selectedTag && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setSelectedTag(null)}
                        >
                            <Text style={[styles.filterChipText, { color: !selectedTag ? '#fff' : colors.text }]}>全部</Text>
                        </TouchableOpacity>
                        {allTags.map(tag => (
                            <TouchableOpacity
                                key={tag}
                                style={[
                                    styles.filterChip,
                                    { borderColor: colors.border },
                                    selectedTag === tag && { backgroundColor: colors.primary, borderColor: colors.primary }
                                ]}
                                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
                            >
                                <Text style={[styles.filterChipText, { color: selectedTag === tag ? '#fff' : colors.text }]}>{tag}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Article List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{fetchText || '載入文章列表中...'}</Text>
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
                                {selectedTag ? `「${selectedTag}」標籤下沒有文章` : '沒有找到文章'}
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
    dateText: {
        fontSize: 11,
        marginTop: 2,
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
