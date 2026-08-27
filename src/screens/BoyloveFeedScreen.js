import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Image, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useComicDownload } from '../context/ComicDownloadContext';
import { Feather } from '@expo/vector-icons';
import { parsers } from '../utils/parsers';
import DownloadProgress from '../components/home/DownloadProgress';

const FILTER_OPTIONS = {
    cate: [
        { label: '全部', value: 0 },
        { label: '韓漫', value: 1 },
        { label: '日漫', value: 2 },
        { label: '國漫', value: 3 },
    ],
    type: [
        { label: '全部', value: 0 },
        { label: '清水', value: 1 },
        { label: '有肉', value: 2 },
    ],
    done: [
        { label: '全部', value: 2 },
        { label: '連載中', value: 0 },
        { label: '已完結', value: 1 },
    ],
    vip: [
        { label: '全部', value: 2 },
        { label: '一般', value: 0 },
        { label: 'VIP', value: 1 },
    ],
    tag: [
        { label: '全部', value: '0' },
        { label: '香香漢化', value: '香香汉化' },
        { label: '年下系列', value: '年下系列' },
        { label: '甜寵', value: '甜宠' },
        { label: '校園', value: '校园' },
        { label: '純愛', value: '纯爱' },
        { label: '美人', value: '美人' },
        { label: '腹黑', value: '腹黑' },
        { label: '人外', value: '人外' },
        { label: '誘受', value: '诱受' },
        { label: '體型差', value: '体型差' },
        { label: '健氣受', value: '健气受' },
        { label: 'ABO', value: 'ABO' },
        { label: '傲嬌', value: '傲娇' },
        { label: '搞笑', value: '搞笑' },
        { label: '強勢系列', value: '强势系列' },
        { label: '忠犬攻', value: '忠犬攻' },
        { label: '青梅竹馬', value: '青梅竹马' },
        { label: '絕世系列', value: '绝世系列' },
        { label: '調教/BDSM', value: '调教｜BDSM' },
        { label: '虐戀', value: '虐恋' },
        { label: '暗戀', value: '暗恋' },
        { label: '天然', value: '天然受' },
        { label: '年上系列', value: '年上系列' },
        { label: '黑皮', value: '黑皮' },
        { label: '心機', value: '心机' },
        { label: '偏執攻', value: '偏执攻' },
        { label: '瘋批', value: '疯批' },
        { label: '救贖', value: '救赎' },
        { label: '道具PLAY', value: '道具PLAY' },
        { label: '男孕', value: '男孕' },
        { label: '雙潔', value: '双洁' },
        { label: '哭包', value: '哭包' },
        { label: '古風', value: '古风' },
        { label: '火葬場', value: '火葬场系列' },
        { label: '奇幻', value: '奇幻' },
        { label: '娛樂圈', value: '娱乐圈' },
        { label: '黑道', value: '黑道' },
        { label: '年齡差/叔系', value: '年龄差｜叔系' },
        { label: '總裁', value: '总裁' },
        { label: '女裝', value: '女装' },
        { label: '深情攻', value: '深情攻' },
        { label: '強制', value: '强制' },
        { label: '多角關係', value: '三角/多角关系' },
        { label: '靈異/鬼怪', value: '灵异｜鬼怪' },
        { label: '骨科', value: '骨科' },
        { label: '病嬌', value: '病娇' },
        { label: '監禁', value: '监禁' },
        { label: '穿越', value: '穿越' },
        { label: '高H', value: '高H' },
    ]
};

export default function BoyloveFeedScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    const { startDownload, activeTask, progressText, queue, cancelDownload, activeTaskProgress } = useComicDownload();

    // Mode: 'search' | 'category'
    const [mode, setMode] = useState('category');
    const [keyword, setKeyword] = useState('');
    
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Search specific state
    const [searched, setSearched] = useState(false);

    // Category specific state
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(false);
    const [filters, setFilters] = useState({
        cate: 0,
        type: 0,
        done: 2,
        vip: 2,
        tag: '0'
    });

    const parser = parsers.find(p => p.domain === 'boylove.cc');

    const fetchCategories = useCallback(async (pageNum = 1, shouldRefresh = false) => {
        if (!parser || !parser.getCategories) return;
        
        if (shouldRefresh) setRefreshing(true);
        else if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await parser.getCategories({
                ...filters,
                page: pageNum
            });
            
            if (pageNum === 1) {
                setResults(data.list);
            } else {
                setResults(prev => [...prev, ...data.list]);
            }
            setLastPage(data.lastPage);
            setPage(pageNum);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    }, [filters, parser]);

    useEffect(() => {
        if (mode === 'category') {
            fetchCategories(1);
        }
    }, [filters, mode, fetchCategories]);

    const handleSearch = async (pageNum = 1, shouldRefresh = false) => {
        if (!keyword.trim() || !parser) return;
        setMode('search');
        
        if (shouldRefresh) setRefreshing(true);
        else if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);
        
        if (pageNum === 1) {
            setSearched(true);
            setResults([]);
        }

        try {
            const data = await parser.search(keyword.trim(), pageNum);
            if (pageNum === 1) {
                setResults(data.list);
            } else {
                setResults(prev => [...prev, ...data.list]);
            }
            setLastPage(data.lastPage);
            setPage(pageNum);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    };

    const clearSearch = () => {
        setKeyword('');
        setMode('category');
        setSearched(false);
        setPage(1);
        setLastPage(false);
        // useEffect will trigger fetchCategories(1) when mode becomes 'category'
    };

    const handleLoadMore = () => {
        if (!loading && !loadingMore && !lastPage) {
            if (mode === 'category') {
                fetchCategories(page + 1);
            } else if (mode === 'search') {
                handleSearch(page + 1);
            }
        }
    };

    const onRefresh = () => {
        if (mode === 'category') {
            fetchCategories(1, true);
        } else if (mode === 'search') {
            handleSearch(1, true);
        }
    };

    const isDownloading = (item) => {
        return activeTask?.id === item.id || queue.some(q => q.id === item.id);
    };

    const renderFilterGroup = (filterKey, options) => {
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                {options.map(opt => {
                    const isActive = filters[filterKey] === opt.value;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            style={[
                                styles.filterPill,
                                isActive ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? '#333' : '#E0E0E0' }
                            ]}
                            onPress={() => setFilters(prev => ({ ...prev, [filterKey]: opt.value }))}
                        >
                            <Text style={[
                                styles.filterText,
                                { color: isActive ? '#FFF' : colors.text }
                            ]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        );
    };

    const renderItem = ({ item }) => {
        const downloading = isDownloading(item);

        return (
            <View style={[styles.itemCard, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF' }]}>
                <Image source={{ uri: item.cover }} style={styles.cover} resizeMode="cover" />
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.itemSub, { color: colors.subText }]}>{item.author}</Text>
                    <Text style={[styles.itemSub, { color: colors.subText }]}>{item.status} - {item.lastChapter}</Text>
                </View>
                <TouchableOpacity 
                    style={[
                        styles.downloadBtn, 
                        downloading ? styles.downloadingBtn : { backgroundColor: colors.primary }
                    ]}
                    onPress={() => !downloading && startDownload(item)}
                    disabled={downloading}
                >
                    <Feather name={downloading ? "loader" : "download"} size={20} color="#FFF" />
                </TouchableOpacity>
            </View>
        );
    };

    const ListFooterComponent = () => {
        if (loadingMore) {
            return (
                <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={colors.primary} />
                </View>
            );
        }
        if (lastPage && results.length > 0) {
            return (
                <View style={styles.footerLoader}>
                    <Text style={{ color: colors.subText }}>已經到底部了</Text>
                </View>
            );
        }
        return null;
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>香香腐宅</Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={[styles.searchBox, { backgroundColor: isDark ? '#2C2C2C' : '#F0F0F0' }]}>
                    <Feather name="search" size={20} color={colors.subText} style={styles.searchIcon} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="搜尋漫畫 (輸入關鍵字)"
                        placeholderTextColor={colors.subText}
                        value={keyword}
                        onChangeText={setKeyword}
                        onSubmitEditing={() => handleSearch(1, false)}
                        returnKeyType="search"
                    />
                    {keyword.length > 0 && (
                        <TouchableOpacity onPress={clearSearch}>
                            <Feather name="x" size={20} color={colors.subText} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {mode === 'category' && (
                <View style={styles.filtersContainer}>
                    {renderFilterGroup('cate', FILTER_OPTIONS.cate)}
                    {renderFilterGroup('type', FILTER_OPTIONS.type)}
                    {renderFilterGroup('done', FILTER_OPTIONS.done)}
                    {renderFilterGroup('tag', FILTER_OPTIONS.tag)}
                </View>
            )}

            {loading && !refreshing ? (
                <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    keyExtractor={(item, index) => item.id + '-' + index}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={ListFooterComponent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                />
            ) : (mode === 'search' && searched) ? (
                <View style={styles.centerBox}>
                    <Text style={{ color: colors.subText }}>無搜尋結果</Text>
                </View>
            ) : mode === 'category' ? (
                <View style={styles.centerBox}>
                    <Text style={{ color: colors.subText }}>目前分類無漫畫</Text>
                </View>
            ) : (
                <View style={styles.centerBox}>
                    <Feather name="search" size={48} color={colors.border} style={{ marginBottom: 16 }} />
                    <Text style={{ color: colors.subText }}>輸入關鍵字搜尋，或清空關鍵字瀏覽分類</Text>
                </View>
            )}

            {/* Active Download Progress */}
            {activeTask && activeTask.url && activeTask.url.includes('boylove') && (
                <DownloadProgress 
                    queue={queue}
                    activeTask={activeTask}
                    progressText={progressText}
                    activeTaskProgress={activeTaskProgress}
                    cancelDownload={cancelDownload}
                    colors={colors}
                    novelId={activeTask?.id}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 },
    backBtn: { padding: 4, marginRight: 12 },
    headerTitle: { fontSize: 20, fontWeight: 'bold' },
    searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, height: '100%', fontSize: 16 },
    filtersContainer: { paddingHorizontal: 16, paddingBottom: 8 },
    filterRow: { flexDirection: 'row', marginBottom: 8 },
    filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
    filterText: { fontSize: 13, fontWeight: '600' },
    listContainer: { padding: 16, paddingTop: 8 },
    itemCard: { flexDirection: 'row', borderRadius: 12, padding: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    cover: { width: 70, height: 100, borderRadius: 8, backgroundColor: '#CCC' },
    itemInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    itemTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    itemSub: { fontSize: 13, marginTop: 4 },
    downloadBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginLeft: 8 },
    downloadingBtn: { backgroundColor: '#999' },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    footerLoader: { padding: 16, alignItems: 'center', justifyContent: 'center' }
});
