import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Image, ScrollView, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useComicDownload } from '../context/ComicDownloadContext';
import { Feather } from '@expo/vector-icons';
import { parsers } from '../utils/parsers';
import boyloveTags from '../utils/boyloveTags.json';

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
    ]
};

export default function BoyloveFeedScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    const { startDownload, activeTask, queue } = useComicDownload();

    // Mode: 'search' | 'category'
    const [mode, setMode] = useState('category');
    const [keyword, setKeyword] = useState('');
    
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isTagsExpanded, setIsTagsExpanded] = useState(false);
    
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

    const renderTagFilterGroup = () => {
        const displayedOptions = boyloveTags.slice(0, 10);
        return (
            <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 }}>
                    {displayedOptions.map(opt => {
                        const isActive = filters.tag === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                style={[
                                    styles.filterPill,
                                    { marginBottom: 8, marginRight: 8, paddingHorizontal: 12, paddingVertical: 6 },
                                    isActive ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? '#333' : '#E0E0E0' }
                                ]}
                                onPress={() => setFilters(prev => ({ ...prev, tag: opt.value }))}
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
                </View>
                <TouchableOpacity 
                    style={{ alignSelf: 'center', padding: 8, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => setIsTagsExpanded(true)}
                >
                    <Text style={{ color: colors.primary, marginRight: 4 }}>
                        {`展開全部標籤 (${boyloveTags.length})`}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.primary} />
                </TouchableOpacity>
            </View>
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
                    {renderTagFilterGroup()}
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


            {/* Tags Modal Drawer */}
            <Modal visible={isTagsExpanded} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>全部標籤</Text>
                            <TouchableOpacity onPress={() => setIsTagsExpanded(false)} style={styles.modalCloseBtn}>
                                <Feather name="x" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ flex: 1, padding: 16 }}>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {boyloveTags.map(opt => {
                                    const isActive = filters.tag === opt.value;
                                    return (
                                        <TouchableOpacity
                                            key={opt.value}
                                            style={[
                                                styles.filterPill,
                                                { marginBottom: 8, marginRight: 8, paddingHorizontal: 12, paddingVertical: 6 },
                                                isActive ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? '#444' : '#E0E0E0' }
                                            ]}
                                            onPress={() => {
                                                setFilters(prev => ({ ...prev, tag: opt.value }));
                                                setIsTagsExpanded(false);
                                                fetchCategories(1, true);
                                            }}
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
                            </View>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
    footerLoader: { padding: 16, alignItems: 'center', justifyContent: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { height: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#444' },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    modalCloseBtn: { padding: 4 }
});
