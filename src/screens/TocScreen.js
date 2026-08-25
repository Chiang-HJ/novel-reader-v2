import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Keyboard, TouchableWithoutFeedback, ScrollView, PanResponder, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getNovelById, deleteChapterData, addChapterData, getChapterText, saveChapterText, updateNovelMetadata, splitChapterData, getAllChapterText, replaceNovelChapters } from '../utils/storage';
import { splitTextIntoChapters, previewMatchedHeadings } from '../utils/parserUtils';
import { useDownload } from '../context/DownloadContext';
import { Feather } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function TocScreen({ route, navigation }) {
    const { colors, isDark } = useTheme();
    const [novel, setNovel] = useState(route.params.novel);
    const { retryChapterDownload } = useDownload();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortAscending, setSortAscending] = useState(true);

    const filteredAndSortedChapters = React.useMemo(() => {
        if (!novel.chapters) return [];
        let result = novel.chapters.map((ch, index) => ({ ...ch, originalIndex: index }));
        
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(ch => ch.title && ch.title.toLowerCase().includes(lowerQuery));
        }
        
        if (!sortAscending) {
            result.reverse();
        }
        
        return result;
    }, [novel.chapters, searchQuery, sortAscending]);

    const initialScrollIndex = React.useMemo(() => {
        if (novel.progressIndex === undefined || novel.progressIndex === null) return 0;
        const idx = filteredAndSortedChapters.findIndex(ch => ch.originalIndex === novel.progressIndex);
        return idx >= 0 ? idx : 0;
    }, []); // Only compute once on mount so it doesn't jump during search/sort

    const [selectedChapterIndex, setSelectedChapterIndex] = useState(null);
    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editMode, setEditMode] = useState(''); // 'insert_before', 'insert_after', 'edit'
    const [editTitle, setEditTitle] = useState('');
    const [editText, setEditText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [isSplitModalVisible, setIsSplitModalVisible] = useState(false);
    const [splitTarget, setSplitTarget] = useState('chapter'); // 'chapter' or 'novel'
    const [splitRegexStr, setSplitRegexStr] = useState('第.*[章節]');
    const [splitExampleStr, setSplitExampleStr] = useState('1.');
    const [splitMode, setSplitMode] = useState('regex');
    const [splitLength, setSplitLength] = useState('5000');
    const [splitProgress, setSplitProgress] = useState(null);
    const [isPreviewingSplit, setIsPreviewingSplit] = useState(false);
    const [splitPreviewList, setSplitPreviewList] = useState([]); // array of title strings
    const [editingPreviewIdx, setEditingPreviewIdx] = useState(null); // index being edited inline
    const [dragIdx, setDragIdx] = useState(null); // index being dragged
    const [dragOverIdx, setDragOverIdx] = useState(null); // index being hovered over
    const dragY = useRef(new Animated.Value(0)).current;
    const dragStartY = useRef(0);
    const itemHeight = 44; // approximate height per row
    const [strictMatch, setStrictMatch] = useState(false);

    const refreshNovel = async () => {
        const n = await getNovelById(novel.id);
        if (n) setNovel(n);
    };

    useFocusEffect(
        useCallback(() => {
            refreshNovel();
        }, [novel.id])
    );

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity onPress={() => {
                    setIsOptionsModalVisible(false);
                    setSplitTarget('novel');
                    setSelectedChapterIndex(null);
                    setIsPreviewingSplit(false);
                    setIsSplitModalVisible(true);
                }}
                    style={{ paddingRight: 15 }}
                >
                    <Feather name="scissors" size={20} color={colors.primary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation, colors]);

    const handleLongPress = useCallback((index) => {
        setSelectedChapterIndex(index);
        setIsOptionsModalVisible(true);
    }, []);

    const openChapterSplitModal = () => {
        setSplitTarget('chapter');
        setIsOptionsModalVisible(false);
        setIsPreviewingSplit(false);
        setIsSplitModalVisible(true);
    };

    const openNovelSplitModal = () => {
        setSplitTarget('novel');
        setSelectedChapterIndex(null);
        setIsPreviewingSplit(false);
        setIsSplitModalVisible(true);
    };

    const handleDeleteChapter = async () => {
        if (selectedChapterIndex === null) return;
        setIsOptionsModalVisible(false);
        try {
            await deleteChapterData(novel.id, selectedChapterIndex);
            await refreshNovel();
        } catch (e) {
            Alert.alert('錯誤', e.message);
        }
    };

    const openEditModal = async (mode) => {
        if (selectedChapterIndex === null) return;
        setEditMode(mode);
        setIsOptionsModalVisible(false);
        
        if (mode === 'edit') {
            const ch = novel.chapters[selectedChapterIndex];
            setEditTitle(ch.title);
            try {
                const textData = await getChapterText(novel.id, selectedChapterIndex);
                setEditText(typeof textData === 'string' ? textData : (textData ? textData.text : ''));
            } catch (e) {
                setEditText('');
            }
        } else {
            setEditTitle('');
            setEditText('');
        }
        
        setIsEditModalVisible(true);
    };

    const handleSaveChapter = async () => {
        if (!editTitle.trim()) {
            Alert.alert('提示', '請輸入章節標題');
            return;
        }
        
        setIsProcessing(true);
        try {
            if (editMode === 'edit') {
                await saveChapterText(novel.id, selectedChapterIndex, editTitle.trim(), editText);
                const newChapters = [...novel.chapters];
                newChapters[selectedChapterIndex].title = editTitle.trim();
                await updateNovelMetadata(novel.id, { chapters: newChapters });
            } else {
                const insertIndex = editMode === 'insert_before' ? selectedChapterIndex : selectedChapterIndex + 1;
                await addChapterData(novel.id, insertIndex, editTitle.trim(), editText);
            }
            await refreshNovel();
            setIsEditModalVisible(false);
        } catch (e) {
            Alert.alert('錯誤', e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const previewSplit = async () => {
        setIsProcessing(true);
        setSplitProgress({ percent: 0, stage: '準備預覽...' });
        try {
            let oldText = '';
            if (splitTarget === 'novel') {
                setSplitProgress({ percent: 0, stage: '正在讀取所有章節內容...' });
                oldText = await getAllChapterText(novel.id, (cur, tot) => {
                    const pct = Math.round((cur / tot) * 30);
                    setSplitProgress({ percent: pct, stage: `讀取章節內文 (${cur}/${tot})...` });
                });
            } else {
                const index = selectedChapterIndex;
                const oldTextData = await getChapterText(novel.id, index);
                if (!oldTextData) {
                    Alert.alert('錯誤', '無法讀取章節內容，請先下載此章節。');
                    return;
                }
                oldText = typeof oldTextData === 'string' ? oldTextData : (oldTextData.text || '');
            }

            setSplitProgress({ percent: 40, stage: '正在預覽章節規則...' });
            await new Promise(r => setTimeout(r, 10));
            
            const matches = previewMatchedHeadings(
                oldText, 
                splitMode, 
                splitMode === 'example' ? splitExampleStr : splitRegexStr,
                strictMatch
            );
            
            setSplitPreviewList(matches);
            setIsPreviewingSplit(true);

            // Auto disorder detection: check if numeric titles are out of order
            const nums = matches.map(m => { const n = m.match(/\d+/); return n ? parseInt(n[0], 10) : null; }).filter(n => n !== null);
            if (nums.length >= 3) {
                let outOfOrder = 0;
                for (let i = 1; i < nums.length; i++) { if (nums[i] < nums[i - 1]) outOfOrder++; }
                if (outOfOrder > 0) {
                    Alert.alert(
                        '偵測到章節順序異常',
                        `有 ${outOfOrder} 個章節的編號順序不連續（可能有作者倒敘或補章）。\n\n要自動依數字排列整齊嗎？`,
                        [
                            { text: '保持原序', style: 'cancel' },
                            { text: '自動排序', onPress: () => {
                                setSplitPreviewList(prev => [...prev].sort((a, b) => {
                                    const na = a.match(/\d+/); const nb = b.match(/\d+/);
                                    if (na && nb) return parseInt(na[0], 10) - parseInt(nb[0], 10);
                                    return 0;
                                }));
                            }}
                        ]
                    );
                }
            }
        } catch (e) {
            Alert.alert('規則錯誤', e.message);
        } finally {
            setIsProcessing(false);
            setSplitProgress(null);
        }
    };

    const executeSplit = async () => {
        setIsProcessing(true);
        setSplitProgress({ percent: 0, stage: '準備中...' });
        try {
            let oldText = '';
            let targetChapterTitle = '';

            if (splitTarget === 'novel') {
                setSplitProgress({ percent: 0, stage: '正在讀取所有章節內容...' });
                oldText = await getAllChapterText(novel.id, (cur, tot) => {
                    const pct = Math.round((cur / tot) * 30);
                    setSplitProgress({ percent: pct, stage: `讀取章節內文 (${cur}/${tot})...` });
                });
                targetChapterTitle = novel.title;
            } else {
                const index = selectedChapterIndex;
                targetChapterTitle = novel.chapters[index].title;
                const oldTextData = await getChapterText(novel.id, index);
                
                if (!oldTextData) {
                    Alert.alert('錯誤', '無法讀取章節內容，請先下載此章節。');
                    setIsProcessing(false);
                    setSplitProgress(null);
                    return;
                }
                oldText = typeof oldTextData === 'string' ? oldTextData : (oldTextData.text || '');
            }

            let newChaptersData = [];

            if (isPreviewingSplit) {
                setSplitProgress({ percent: 40, stage: '正在依自訂清單分割...' });
                await new Promise(r => setTimeout(r, 10));
                try {
                    newChaptersData = splitTextIntoChapters(
                        oldText, 
                        'list', 
                        splitPreviewList.join('\n'), 
                        targetChapterTitle
                    );
                    
                    // Reorder newChaptersData to exactly match the user's sorted splitPreviewList
                    if (newChaptersData.length > 0) {
                        const orderMap = new Map();
                        // Assign priority index based on the preview list order
                        splitPreviewList.forEach((title, index) => {
                            // Only set if not already set (in case of duplicates, keep first occurrence)
                            if (!orderMap.has(title.trim())) orderMap.set(title.trim(), index);
                        });
                        
                        newChaptersData.sort((a, b) => {
                            if (a.title === '前言/簡介') return -1;
                            if (b.title === '前言/簡介') return 1;
                            const idxA = orderMap.has(a.title.trim()) ? orderMap.get(a.title.trim()) : 999999;
                            const idxB = orderMap.has(b.title.trim()) ? orderMap.get(b.title.trim()) : 999999;
                            return idxA - idxB;
                        });
                    }
                } catch (e) {
                    Alert.alert('規則錯誤', e.message);
                    setIsProcessing(false);
                    setSplitProgress(null);
                    return;
                }
            } else if (splitMode === 'regex' || splitMode === 'example') {
                setSplitProgress({ percent: 40, stage: '正在匹配章節規則...' });
                await new Promise(r => setTimeout(r, 10));
                try {
                    newChaptersData = splitTextIntoChapters(
                        oldText, 
                        splitMode, 
                        splitMode === 'example' ? splitExampleStr : splitRegexStr, 
                        targetChapterTitle,
                        strictMatch
                    );
                } catch (e) {
                    Alert.alert('規則錯誤', e.message);
                    setIsProcessing(false);
                    setSplitProgress(null);
                    return;
                }
            } else {
                const targetLen = parseInt(splitLength, 10);
                if (isNaN(targetLen) || targetLen < 100) {
                    Alert.alert('字數錯誤', '請輸入正確的字數 (最少 100 字)。');
                    setIsProcessing(false);
                    setSplitProgress(null);
                    return;
                }
                
                setSplitProgress({ percent: 40, stage: '正在進行段落字數分割...' });
                const paragraphs = oldText.split('\n');
                let currentChunk = '';
                let partIndex = 1;
                
                for (let i = 0; i < paragraphs.length; i++) {
                    const p = paragraphs[i].trim();
                    if (!p) continue;
                    
                    if (p.length > targetLen * 1.5) {
                        let remaining = p;
                        while (remaining.length > 0) {
                            if (remaining.length <= targetLen) {
                                if (currentChunk.length + remaining.length > targetLen && currentChunk.length > 0) {
                                    newChaptersData.push({ title: `${targetChapterTitle} (Part ${partIndex})`, text: currentChunk.trim() });
                                    currentChunk = remaining + '\n';
                                    partIndex++;
                                } else {
                                    currentChunk += remaining + '\n';
                                }
                                break;
                            } else {
                                let breakIndex = targetLen;
                                const searchWindow = remaining.substring(Math.max(0, targetLen - 100), targetLen + 100);
                                const lastPunc = Math.max(
                                    searchWindow.lastIndexOf('。'),
                                    searchWindow.lastIndexOf('！'),
                                    searchWindow.lastIndexOf('？'),
                                    searchWindow.lastIndexOf('”'),
                                    searchWindow.lastIndexOf('」')
                                );
                                if (lastPunc !== -1) {
                                    breakIndex = Math.max(0, targetLen - 100) + lastPunc + 1;
                                }
                                
                                const chunk = remaining.substring(0, breakIndex);
                                if (currentChunk.length > 0) {
                                    newChaptersData.push({ title: `${targetChapterTitle} (Part ${partIndex})`, text: currentChunk.trim() });
                                    partIndex++;
                                    currentChunk = '';
                                }
                                newChaptersData.push({ title: `${targetChapterTitle} (Part ${partIndex})`, text: chunk.trim() });
                                partIndex++;
                                remaining = remaining.substring(breakIndex);
                            }
                        }
                    } else {
                        if (currentChunk.length + p.length > targetLen && currentChunk.length > 0) {
                            newChaptersData.push({ title: `${targetChapterTitle} (Part ${partIndex})`, text: currentChunk.trim() });
                            currentChunk = p + '\n';
                            partIndex++;
                        } else {
                            currentChunk += p + '\n';
                        }
                    }

                    if (i % 200 === 0) {
                        const pct = 40 + Math.round((i / paragraphs.length) * 30);
                        setSplitProgress({ percent: pct, stage: `正在分割段落 (${Math.round((i / paragraphs.length) * 100)}%)...` });
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
                if (currentChunk.trim().length > 0) {
                    newChaptersData.push({ title: `${targetChapterTitle} (Part ${partIndex})`, text: currentChunk.trim() });
                }
            }

            if (newChaptersData.length === 0) {
                setIsProcessing(false);
                setSplitProgress(null);
                return;
            }

            if (splitTarget === 'novel') {
                setSplitProgress({ percent: 70, stage: '正在寫入新章節資料...' });
                await replaceNovelChapters(novel.id, newChaptersData, (cur, tot) => {
                    const pct = 70 + Math.round((cur / tot) * 30);
                    setSplitProgress({ percent: pct, stage: `儲存章節中 (${cur}/${tot})...` });
                });
            } else {
                setSplitProgress({ percent: 80, stage: '正在更新章節資料...' });
                await splitChapterData(novel.id, selectedChapterIndex, newChaptersData);
            }
            
            await refreshNovel();
            
            setIsSplitModalVisible(false);
            Alert.alert('成功', `已將${splitTarget === 'novel' ? '整本小說' : '章節'}成功分割為 ${newChaptersData.length} 章！`);
        } catch (e) {
            Alert.alert('錯誤', e.message);
        } finally {
            setIsProcessing(false);
            setSplitProgress(null);
        }
    };

    const handleRetryFailedChapters = async () => {
        setIsProcessing(true);
        setSplitProgress({ percent: 0, stage: '正在掃描失敗章節...' });
        let failedCount = 0;
        let fixedCount = 0;

        for (let i = 0; i < novel.chapters.length; i++) {
            const textData = await getChapterText(novel.id, i);
            const text = typeof textData === 'string' ? textData : (textData?.text || '');
            if (!text || text.includes('【章節下載失敗：網路連線逾時】')) {
                failedCount++;
                setSplitProgress({ percent: Math.round((i/novel.chapters.length)*100), stage: `正在重試: ${novel.chapters[i].title}` });
                const success = await retryChapterDownload(novel.id, i, novel.chapters[i].url, novel.chapters[i].title);
                if (success) {
                    fixedCount++;
                }
            }
        }
        
        setIsProcessing(false);
        setSplitProgress(null);
        
        if (failedCount === 0) {
            Alert.alert('提示', '沒有發現下載失敗的章節。');
        } else {
            Alert.alert('修復完畢', `共發現 ${failedCount} 個失敗章節，成功修復 ${fixedCount} 個。`);
        }
    };

    const handleRetrySingleChapter = async () => {
        if (selectedChapterIndex === null) return;
        setIsOptionsModalVisible(false);
        setIsProcessing(true);
        setSplitProgress({ percent: 50, stage: `正在重試: ${novel.chapters[selectedChapterIndex].title}` });
        
        const success = await retryChapterDownload(novel.id, selectedChapterIndex, novel.chapters[selectedChapterIndex].url, novel.chapters[selectedChapterIndex].title);
        
        setIsProcessing(false);
        setSplitProgress(null);
        
        if (success) {
            Alert.alert('成功', '章節重新下載成功！');
        } else {
            Alert.alert('失敗', '章節重新下載失敗，請稍後再試。');
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <FlatList 
                data={filteredAndSortedChapters}
                keyExtractor={(item) => item.originalIndex.toString()}
                initialScrollIndex={filteredAndSortedChapters.length > 0 && initialScrollIndex < filteredAndSortedChapters.length ? initialScrollIndex : undefined}
                onScrollToIndexFailed={(info) => {
                    const wait = new Promise(resolve => setTimeout(resolve, 500));
                    wait.then(() => {
                        // FlatList might not be ready, ignore failures
                    });
                }}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                getItemLayout={(data, index) => (
                    {length: 50, offset: 50 * index, index}
                )}
                ListHeaderComponent={
                    <View style={[styles.toolbar, { borderBottomColor: colors.border, flexDirection: 'column', gap: 12 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity
                                style={[styles.toolbarBtn, { backgroundColor: colors.primary, flex: 1 }]}
                                onPress={openNovelSplitModal}
                                disabled={isProcessing}
                            >
                                <Feather name="scissors" size={18} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.toolbarBtnText}>整本重分割</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toolbarBtn, { backgroundColor: '#FF9500', flex: 1 }]}
                                onPress={handleRetryFailedChapters}
                                disabled={isProcessing}
                            >
                                <Feather name="refresh-cw" size={18} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.toolbarBtnText}>修復失敗</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.toolbarBtn, { backgroundColor: colors.surface, flex: 1, borderWidth: 1, borderColor: colors.border }]}
                                onPress={() => setSortAscending(!sortAscending)}
                            >
                                <Feather name={sortAscending ? "arrow-down" : "arrow-up"} size={18} color={colors.text} style={{ marginRight: 8 }} />
                                <Text style={[styles.toolbarBtnText, { color: colors.text }]}>{sortAscending ? '正序' : '倒序'}</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
                            <Feather name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                            <TextInput
                                style={{ flex: 1, color: colors.text, height: '100%' }}
                                placeholder="搜尋章節名稱..."
                                placeholderTextColor={colors.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Feather name="x-circle" size={18} color={colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                }
                renderItem={useCallback(({ item }) => {
                    const originalIndex = item.originalIndex;
                    const isCurrent = novel.progressIndex === originalIndex;
                    return (
                        <TouchableOpacity 
                            style={[
                                styles.item, 
                                { borderBottomColor: colors.border },
                                isCurrent && { backgroundColor: colors.highlight }
                            ]}
                            onPress={() => {
                                navigation.navigate('Reader', { novelId: novel.id, initialChapterIndex: originalIndex });
                            }}
                            onLongPress={() => handleLongPress(originalIndex)}
                        >
                            <Text style={[
                                styles.title,
                                { color: isCurrent ? colors.primary : colors.text },
                                isCurrent && { fontWeight: 'bold' }
                            ]} numberOfLines={1}>
                                {item.title}
                            </Text>
                        </TouchableOpacity>
                    );
                }, [colors, novel.id, novel.progressIndex, navigation, handleLongPress])}
            />

            {/* Options Modal */}
            <Modal visible={isOptionsModalVisible} transparent={true} animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsOptionsModalVisible(false)}>
                    <View style={[styles.optionsContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.optionsTitle, { color: colors.textSecondary }]}>
                            {selectedChapterIndex !== null ? novel.chapters[selectedChapterIndex].title : ''}
                        </Text>
                        
                        <TouchableOpacity style={[styles.optionBtn, { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={() => openEditModal('edit')}>
                            <Feather name="edit-2" size={20} color={colors.text} style={styles.optionIcon} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>修改此章節</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={[styles.optionBtn, { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={() => openEditModal('insert_before')}>
                            <Feather name="arrow-up" size={20} color={colors.text} style={styles.optionIcon} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>在此章節「上方」新增一章</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={[styles.optionBtn, { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={() => openEditModal('insert_after')}>
                            <Feather name="arrow-down" size={20} color={colors.text} style={styles.optionIcon} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>在此章節「下方」新增一章</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={[styles.optionBtn, { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={openChapterSplitModal}>
                            <Feather name="scissors" size={20} color={colors.text} style={styles.optionIcon} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>分割此章節</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={[styles.modalOption, { borderBottomColor: colors.border }]} onPress={handleRetrySingleChapter}>
                            <Feather name="refresh-cw" size={20} color="#FF9500" />
                            <Text style={[styles.modalOptionText, { color: '#FF9500' }]}>重新下載此章節</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.modalOption, { borderBottomColor: colors.border }]} onPress={handleDeleteChapter}>
                            <Feather name="trash-2" size={20} color={colors.danger} />
                            <Text style={[styles.modalOptionText, { color: colors.danger }]}>刪除此章節</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Split Modal */}
            <Modal visible={isSplitModalVisible} transparent={true} animationType="slide">
                <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.editContent, { backgroundColor: colors.surface }]}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>
                                {splitTarget === 'novel' ? '整本重分割' : '自動分割章節'}
                            </Text>
                            <TouchableOpacity onPress={() => setIsSplitModalVisible(false)} style={{padding: 5}}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        
                        {isPreviewingSplit ? (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>共 {splitPreviewList.length} 個章節，長按可拖曳排序</Text>
                                    <TouchableOpacity onPress={() => setIsPreviewingSplit(false)}>
                                        <Text style={{ color: colors.primary, fontSize: 13 }}>返回設定</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flex: 1, maxHeight: 300, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                                    <FlatList
                                        data={splitPreviewList}
                                        keyExtractor={(item, index) => `${index}-${item}`}
                                        containerStyle={{ flex: 1 }}
                                        renderItem={({ item, index }) => {
                                            const idx = index;
                                            return (
                                                <View>
                                                        {/* Insert Above */}
                                                        <TouchableOpacity
                                                            style={{ alignItems: 'center', paddingVertical: 3 }}
                                                            onPress={() => {
                                                                const newList = [...splitPreviewList];
                                                                newList.splice(idx, 0, '');
                                                                setSplitPreviewList(newList);
                                                                setEditingPreviewIdx(idx);
                                                            }}
                                                        >
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.3 }}>
                                                                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary }} />
                                                                <Feather name="plus" size={11} color={colors.primary} style={{ marginHorizontal: 6 }} />
                                                                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary }} />
                                                            </View>
                                                        </TouchableOpacity>

                                                        {/* Item Row */}
                                                        <View style={{
                                                            flexDirection: 'row', alignItems: 'center',
                                                            paddingHorizontal: 10, paddingVertical: 9,
                                                            backgroundColor:
                                                                editingPreviewIdx === idx ? (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)')
                                                                : 'transparent',
                                                        }}>
                                                            {/* Drag handle */}
                                                            <TouchableOpacity
                                                                style={{ paddingRight: 8, paddingVertical: 4 }}
                                                                onPress={() => setEditingPreviewIdx(idx)}
                                                            >
                                                                <Feather name="menu" size={16} color={colors.textSecondary} />
                                                            </TouchableOpacity>

                                                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary + '22', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                                                                <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '700' }}>{idx + 1}</Text>
                                                            </View>

                                                            {editingPreviewIdx === idx ? (
                                                                <TextInput
                                                                    style={{ flex: 1, color: colors.text, fontSize: 14, padding: 0 }}
                                                                    value={item}
                                                                    autoFocus
                                                                    onChangeText={(t) => {
                                                                        const newList = [...splitPreviewList];
                                                                        newList[idx] = t;
                                                                        setSplitPreviewList(newList);
                                                                    }}
                                                                    onBlur={() => {
                                                                        if (!splitPreviewList[idx]?.trim()) {
                                                                            setSplitPreviewList(prev => prev.filter((_, i) => i !== idx));
                                                                        }
                                                                        setEditingPreviewIdx(null);
                                                                    }}
                                                                    returnKeyType="done"
                                                                    onSubmitEditing={() => setEditingPreviewIdx(null)}
                                                                />
                                                            ) : (
                                                                <TouchableOpacity
                                                                    style={{ flex: 1 }}
                                                                    onPress={() => setEditingPreviewIdx(idx)}
                                                                    onLongPress={() => {
                                                                        Alert.alert('刪除章節', `確定要刪除「${item}」嗎？`, [
                                                                            { text: '取消', style: 'cancel' },
                                                                            { text: '刪除', style: 'destructive', onPress: () => {
                                                                                setSplitPreviewList(prev => prev.filter((_, i) => i !== idx));
                                                                            }}
                                                                        ]);
                                                                    }}
                                                                    delayLongPress={600}
                                                                >
                                                                    <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>{item}</Text>
                                                                </TouchableOpacity>
                                                            )}

                                                            <TouchableOpacity
                                                                style={{ padding: 6, marginLeft: 2 }}
                                                                onPress={() => {
                                                                    setSplitPreviewList(prev => prev.filter((_, i) => i !== idx));
                                                                    if (editingPreviewIdx === idx) setEditingPreviewIdx(null);
                                                                }}
                                                            >
                                                                <Feather name="x" size={16} color={colors.textSecondary} />
                                                            </TouchableOpacity>
                                                        </View>

                                                        {/* Insert Below (after last only) */}
                                                        {idx === splitPreviewList.length - 1 && (
                                                            <TouchableOpacity
                                                                style={{ alignItems: 'center', paddingVertical: 3 }}
                                                                onPress={() => {
                                                                    setSplitPreviewList(prev => [...prev, '']);
                                                                    setEditingPreviewIdx(splitPreviewList.length);
                                                                }}
                                                            >
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.3 }}>
                                                                    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary }} />
                                                                    <Feather name="plus" size={11} color={colors.primary} style={{ marginHorizontal: 6 }} />
                                                                    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary }} />
                                                                </View>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                            );
                                        }}
                                    />
                                    {splitPreviewList.length === 0 && (
                                        <TouchableOpacity
                                            style={{ padding: 16, alignItems: 'center' }}
                                            onPress={() => { setSplitPreviewList(['']); setEditingPreviewIdx(0); }}
                                        >
                                            <Text style={{ color: colors.primary }}>＋ 新增第一個章節標題</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                                    <TouchableOpacity 
                                        style={{ flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: splitMode === 'regex' ? colors.primary : 'transparent' }}
                                        onPress={() => setSplitMode('regex')}
                                    >
                                        <Text style={{ color: splitMode === 'regex' ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>規則分割</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={{ flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: splitMode === 'example' ? colors.primary : 'transparent' }}
                                        onPress={() => setSplitMode('example')}
                                    >
                                        <Text style={{ color: splitMode === 'example' ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>範例分割</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={{ flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: splitMode === 'length' ? colors.primary : 'transparent' }}
                                        onPress={() => setSplitMode('length')}
                                    >
                                        <Text style={{ color: splitMode === 'length' ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>字數分割</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                {splitMode === 'example' ? (
                                    <>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10}}>請輸入章節的編號範例</Text>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10, fontSize: 12}}>例如輸入: 1. 或 第1章</Text>
                                        <TextInput 
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5', height: 50, paddingHorizontal: 15 }]} 
                                            value={splitExampleStr}
                                            onChangeText={setSplitExampleStr}
                                            placeholder="輸入範例，例如: 1."
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                        <TouchableOpacity 
                                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 5 }} 
                                            onPress={() => setStrictMatch(!strictMatch)}
                                        >
                                            <Feather name={strictMatch ? "check-square" : "square"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
                                            <Text style={{ color: colors.textSecondary }}>嚴格要求數字後方必須有標點符號或空格</Text>
                                        </TouchableOpacity>
                                        <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 12 }}>提示：輸入數字 (例如 001 或 1) 時，系統會自動將其視為「所有連續數字」(包含 1, 2, 002, 100 等)。如果預覽中出現如「10年前」的誤判，請勾選上方選項或手動刪除。</Text>
                                    </>
                                ) : splitMode === 'regex' ? (
                                    <>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10}}>請輸入用來分割章節的關鍵字或規則 (Regex)：</Text>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10, fontSize: 12}}>例如: 第.*[章節] 會切分出「第一章」、「第十二節」等。</Text>
                                        <TextInput 
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5', height: 50, paddingHorizontal: 15 }]} 
                                            placeholder="第.*[章節]"
                                            placeholderTextColor={colors.textSecondary}
                                            value={splitRegexStr}
                                            onChangeText={setSplitRegexStr}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10}}>請輸入每個章節大約的字數 (字)：</Text>
                                        <Text style={{color: colors.textSecondary, marginBottom: 10, fontSize: 12}}>系統會以段落為單位進行分割，確保不會把一句話切斷。</Text>
                                        <TextInput 
                                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#f5f5f5', height: 50, paddingHorizontal: 15 }]} 
                                            placeholder="5000"
                                            keyboardType="numeric"
                                            placeholderTextColor={colors.textSecondary}
                                            value={splitLength}
                                            onChangeText={setSplitLength}
                                        />
                                    </>
                                )}
                            </>
                        )}
                        
                        {isProcessing && splitProgress && (
                            <View style={{ marginTop: 15, marginBottom: 5 }}>
                                <Text style={{ color: colors.primary, fontSize: 13, textAlign: 'center', marginBottom: 6, fontWeight: '600' }}>
                                    {splitProgress.stage || '處理中...'}
                                </Text>
                                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                                    <View style={{ width: `${Math.min(100, Math.max(0, splitProgress.percent || 0))}%`, height: '100%', backgroundColor: colors.primary }} />
                                </View>
                            </View>
                        )}
                        
                        {isPreviewingSplit ? (
                            <TouchableOpacity 
                                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isProcessing ? 0.7 : 1 }]} 
                                onPress={executeSplit}
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>
                                        確認依此清單分割
                                    </Text>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                                {(splitMode === 'example' || splitMode === 'regex') && (
                                    <TouchableOpacity 
                                        style={[styles.saveBtn, { backgroundColor: '#FF9500', opacity: isProcessing ? 0.7 : 1, flex: 1, marginTop: 0 }]} 
                                        onPress={previewSplit}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing && splitProgress?.stage.includes('預覽') ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <Text style={[styles.saveBtnText, { fontSize: 14 }]}>產生預覽清單</Text>
                                        )}
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity 
                                    style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isProcessing ? 0.7 : 1, flex: 1, marginTop: 0 }]} 
                                    onPress={executeSplit}
                                    disabled={isProcessing}
                                >
                                    {isProcessing && !splitProgress?.stage.includes('預覽') ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={[styles.saveBtnText, { fontSize: 14 }]}>
                                            直接開始分割
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
                </TouchableWithoutFeedback>
                </GestureHandlerRootView>
            </Modal>

            {/* Edit/Add Chapter Modal */}
            <Modal visible={isEditModalVisible} transparent={true} animationType="slide">
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.editContent, { backgroundColor: colors.surface }]}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>
                                {editMode === 'edit' ? '修改章節' : '新增章節'}
                            </Text>
                            <TouchableOpacity onPress={() => setIsEditModalVisible(false)} style={{padding: 5}}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 15, height: 50, borderRadius: 8, paddingHorizontal: 15 }]}
                            placeholder="章節標題..."
                            placeholderTextColor={colors.textSecondary}
                            value={editTitle}
                            onChangeText={setEditTitle}
                        />

                        <TextInput
                            style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, flex: 1, textAlignVertical: 'top', padding: 15, borderRadius: 8, marginBottom: 15 }]}
                            placeholder="章節內文..."
                            placeholderTextColor={colors.textSecondary}
                            value={editText}
                            onChangeText={setEditText}
                            multiline={true}
                        />

                        <TouchableOpacity 
                            style={[{ backgroundColor: colors.primary, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center', opacity: isProcessing ? 0.7 : 1 }]} 
                            onPress={handleSaveChapter}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>儲存章節</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                </TouchableWithoutFeedback>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    toolbar: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
    toolbarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 10 },
    toolbarBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    item: { padding: 16, borderBottomWidth: 1 },
    title: { fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    optionsContent: { width: '80%', borderRadius: 16, overflow: 'hidden' },
    optionsTitle: { padding: 16, fontSize: 14, textAlign: 'center', fontWeight: '500' },
    optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    optionIcon: { marginRight: 16 },
    editContent: { width: '90%', height: '80%', borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    input: { borderWidth: 1, borderRadius: 8, marginBottom: 15 },
    saveBtn: { height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
