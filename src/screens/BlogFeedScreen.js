import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { getArticles, refreshFeed, fetchArticleContent } from '../utils/blogFeedService';
import { saveNovelToBookshelf, saveChapterText, getBookshelf } from '../utils/storage';
import { convertS2T } from '../utils/opencc';
import { splitTextIntoChapters } from '../utils/parserUtils';

const formatDate = (isoStr) => {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
    } catch {
        return '';
    }
};

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
            const yulujiIds = list
                .filter(n => n?.id && typeof n.id === 'string' && n.id.startsWith('blog_yuluji_'))
                .map(n => n.id.replace('blog_yuluji_', ''));
            if (isMountedRef.current) {
                setDownloadedIds(new Set(yulujiIds));
            }
        } catch (e) {
            console.warn('Failed to load downloaded ids:', e);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadDownloadedIds();
        }, [loadDownloadedIds])
    );

    const saveDownloadedId = useCallback((id) => {
        setDownloadedIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    const extractTags = useCallback((articleList) => {
        const tagSet = new Set();
        (articleList || []).forEach(a => {
            (a?.tags || []).forEach(t => {
                if (t) tagSet.add(t);
            });
        });
        const sorted = [...tagSet].sort();
        setAllTags(sorted);
    }, []);

    const loadFeed = useCallback(async () => {
        try {
            if (isMountedRef.current) {
                setIsLoading(true);
                setFetchProgress(0);
                setFetchText('準備獲取文章...');
            }
            const result = await getArticles((loaded, total) => {
                if (isMountedRef.current && total > 0) {
                    setFetchProgress(loaded / total);
                    setFetchText(`正在獲取 ${loaded} / ${total}...`);
                }
            });
            if (isMountedRef.current && result) {
                const articleList = Array.isArray(result.articles) ? result.articles : [];
                setArticles(articleList);
                setLastUpdated(result.lastUpdated || null);
                extractTags(articleList);
            }
        } catch (e) {
            if (isMountedRef.current) {
                Alert.alert('載入失敗', '無法載入文章列表：' + (e?.message || '未知錯誤'));
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [extractTags]);

    const handleRefresh = useCallback(async () => {
        try {
            setIsRefreshing(true);
            setFetchProgress(0);
            setFetchText('準備獲取文章...');
            const freshArticles = await refreshFeed((loaded, total) => {
                if (isMountedRef.current && total > 0) {
                    setFetchProgress(loaded / total);
                    setFetchText(`正在獲取 ${loaded} / ${total}...`);
                }
            });
            if (isMountedRef.current) {
                const safeArticles = Array.isArray(freshArticles) ? freshArticles : [];
                setArticles(safeArticles);
                setLastUpdated(Date.now());
                extractTags(safeArticles);
                Alert.alert('更新完成', `已載入 ${safeArticles.length} 篇文章`);
            }
        } catch (e) {
            if (isMountedRef.current) {
                Alert.alert('更新失敗', '無法連線至語錄集：' + (e?.message || '未知錯誤'));
            }
        } finally {
            if (isMountedRef.current) {
                setIsRefreshing(false);
            }
        }
    }, [extractTags]);

    const handleDownload = useCallback(async (article) => {
        if (!article?.id || downloadingId) return;
        setDownloadingId(article.id);

        try {
            // Fetch and parse the article content
            let text = await fetchArticleContent(article.url);
            text = convertS2T(text);

            const novelId = 'blog_yuluji_' + article.id;
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
                author: '語錄集',
                cover: '',
                url: article.url || '',
                chapters: (newChaptersData || []).map(c => ({ title: c.title, url: article.url || '' })),
                chapterCount: newChaptersData.length,
                downloadedChapters: newChaptersData.length,
                folderId: 'vault',
                isHidden: true,
            };

            await saveNovelToBookshelf(novelInfo);
            saveDownloadedId(article.id);

            Alert.alert('下載完成', `《${chapterTitle}》已加入書架！`);
        } catch (e) {
            Alert.alert('下載失敗', e?.message || '未知錯誤');
        } finally {
            if (isMountedRef.current) {
                setDownloadingId(null);
            }
        }
    }, [downloadingId, saveDownloadedId]);

    const handleArticlePress = useCallback((article) => {
        if (!article?.id) return;
        if (downloadedIds.has(article.id)) {
            const novelId = 'blog_yuluji_' + article.id;
            navigation.navigate('Reader', { novelId, title: article.title || '' });
        } else {
            Alert.alert(
                article.title || '下載確認',
                article.summary ? article.summary.substring(0, 200) + '...' : '要下載這篇文章嗎？',
                [
                    { text: '取消', style: 'cancel' },
                    { text: '下載', onPress: () => handleDownload(article) }
                ]
            );
        }
    }, [downloadedIds, navigation, handleDownload]);

    const filteredArticles = useMemo(() => {
        if (!selectedTag) return articles;
        return articles.filter(a => Array.isArray(a?.tags) && a.tags.includes(selectedTag));
    }, [articles, selectedTag]);

    const keyExtractor = useCallback(item => item?.id || String(Math.random()), []);

    const renderArticle = useCallback(({ item }) => {
        if (!item) return null;
        const isDownloaded = downloadedIds.has(item.id);
        const isDownloading = downloadingId === item.id;
        const tags = Array.isArray(item.tags) ? item.tags : [];

        return (
            <TouchableOpacity
                style={[styles.articleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleArticlePress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.articleContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>
                            {item.title || '(無標題)'}
                        </Text>
                        <View style={styles.tagsRow}>
                            {tags.slice(0, 3).map((tag, idx) => (
                                <View key={idx} style={[styles.tagBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                    <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                                </View>
                            ))}
                            {tags.length > 3 && (
                                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>+{tags.length - 3}</Text>
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
    }, [colors, isDark, downloadedIds, downloadingId, handleArticlePress, handleDownload]);

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
