import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getNovelById, deleteChapterData, addChapterData, getChapterText, saveChapterText, updateNovelMetadata, splitChapterData, getAllChapterText, replaceNovelChapters } from '../utils/storage';
import { Feather } from '@expo/vector-icons';

export default function TocScreen({ route, navigation }) {
    const { colors, isDark } = useTheme();
    const [novel, setNovel] = useState(route.params.novel);
    
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

    const refreshNovel = async () => {
        const n = await getNovelById(novel.id);
        if (n) setNovel(n);
    };

    useFocusEffect(
        useCallback(() => {
            refreshNovel();
        }, [novel.id])
    );

    const handleLongPress = (index) => {
        setSelectedChapterIndex(index);
        setIsOptionsModalVisible(true);
    };

    const openChapterSplitModal = () => {
        setSplitTarget('chapter');
        setIsOptionsModalVisible(false);
        setIsSplitModalVisible(true);
    };

    const openNovelSplitModal = () => {
        setSplitTarget('novel');
        setSelectedChapterIndex(null);
        setIsSplitModalVisible(true);
    };

    const handleDeleteChapter = () => {
        Alert.alert('刪除章節', `確定要刪除「${novel.chapters[selectedChapterIndex].title}」嗎？\n刪除後後面的章節編號會自動遞補。`, [
            { text: '取消', style: 'cancel' },
            { 
                text: '確定刪除', 
                style: 'destructive',
                onPress: async () => {
                    setIsProcessing(true);
                    await deleteChapterData(novel.id, selectedChapterIndex);
                    await refreshNovel();
                    setIsProcessing(false);
                    setIsOptionsModalVisible(false);
                }
            }
        ]);
    };

    const openEditModal = async (mode) => {
        setEditMode(mode);
        setIsOptionsModalVisible(false);
        setIsProcessing(true);
        
        if (mode === 'edit') {
            setEditTitle(novel.chapters[selectedChapterIndex].title);
            const content = await getChapterText(novel.id, selectedChapterIndex);
            setEditText(content ? content.text : '');
        } else {
            setEditTitle('');
            setEditText('');
        }
        
        setIsProcessing(false);
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

    const buildChaptersFromText = (rawText, baseTitle, requireMatch = true) => {
        const oldText = rawText || '';
        const newChaptersData = [];

        if (splitMode === 'regex' || splitMode === 'example') {
            let regexStr = splitRegexStr;
            if (splitMode === 'example') {
                if (!splitExampleStr.trim()) {
                    throw new Error('請輸入章節編號範例。');
                }
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regexStr = escapeRegExp(splitExampleStr.trim()).replace(/\d+/g, '\\d+');
            } else if (!splitRegexStr.trim()) {
                throw new Error('請輸入分割規則。');
            }

            let regex;
            try {
                regex = new RegExp('(' + regexStr + ')', 'g');
            } catch(e) {
                throw new Error('規則錯誤：您輸入的條件不合法。');
            }

            const parts = oldText.split(regex);
            if (parts.length <= 1) {
                if (requireMatch) {
                    throw new Error('找不到符合此規則的章節標題。');
                }
                return [{ title: baseTitle, text: oldText.trim() }];
            }

            const preface = parts[0].trim();
            if (preface.length > 0) {
                newChaptersData.push({ title: `${baseTitle} (前言)`, text: preface });
            }

            for (let i = 1; i < parts.length; i += 2) {
                const title = parts[i].trim();
                const text = (parts[i + 1] || '').trim();
                if (text.length === 0) continue;
                newChaptersData.push({ title, text });
            }
        } else {
            const targetLen = parseInt(splitLength, 10);
            if (isNaN(targetLen) || targetLen < 100) {
                throw new Error('請輸入正確的字數 (最少 100 字)。');
            }

            const paragraphs = oldText.split('\n');
            let currentChunk = '';
            let partIndex = 1;

            const pushChunk = (text) => {
                const cleaned = text.trim();
                if (!cleaned) return;
                newChaptersData.push({ title: `${baseTitle} (Part ${partIndex})`, text: cleaned });
                partIndex++;
            };

            for (let i = 0; i < paragraphs.length; i++) {
                const p = paragraphs[i].trim();
                if (!p) continue;

                if (p.length > targetLen * 1.5) {
                    let remaining = p;
                    while (remaining.length > 0) {
                        if (remaining.length <= targetLen) {
                            if (currentChunk.length + remaining.length > targetLen && currentChunk.length > 0) {
                                pushChunk(currentChunk);
                                currentChunk = remaining + '\n';
                            } else {
                                currentChunk += remaining + '\n';
                            }
                            break;
                        }

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

                        if (currentChunk.length > 0) {
                            pushChunk(currentChunk);
                            currentChunk = '';
                        }
                        pushChunk(remaining.substring(0, breakIndex));
                        remaining = remaining.substring(breakIndex);
                    }
                } else if (currentChunk.length + p.length > targetLen && currentChunk.length > 0) {
                    pushChunk(currentChunk);
                    currentChunk = p + '\n';
                } else {
                    currentChunk += p + '\n';
                }
            }

            if (currentChunk.trim().length > 0) {
                pushChunk(currentChunk);
            }
        }

        if (newChaptersData.length === 0) {
            throw new Error('分割後沒有產生任何章節。');
        }

        return newChaptersData;
    };

    const performSplit = async () => {
        setIsProcessing(true);
        try {
            if (splitTarget === 'novel') {
                const fullText = await getAllChapterText(novel.id);
                if (!fullText.trim()) {
                    throw new Error('無法讀取整本小說內容。');
                }

                const newChaptersData = buildChaptersFromText(fullText, novel.title || '重新分割', true);
                await replaceNovelChapters(novel.id, newChaptersData);
                await refreshNovel();

                setIsSplitModalVisible(false);
                Alert.alert('成功', `已將整本小說重新分割為 ${newChaptersData.length} 章！`);
                return;
            }

            const index = selectedChapterIndex;
            const targetChapter = novel.chapters[index];
            const oldTextData = await getChapterText(novel.id, index);
            if (!oldTextData) {
                throw new Error('無法讀取章節內容，請先下載此章節。');
            }

            const oldText = typeof oldTextData === 'string' ? oldTextData : (oldTextData.text || '');
            const newChaptersData = buildChaptersFromText(oldText, targetChapter.title, true);

            await splitChapterData(novel.id, index, newChaptersData);
            await refreshNovel();

            setIsSplitModalVisible(false);
            Alert.alert('成功', `已將章節成功分割為 ${newChaptersData.length} 章！`);
        } catch (e) {
            Alert.alert('錯誤', e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const executeSplit = async () => {
        if (splitTarget === 'novel') {
            Alert.alert(
                '重新分割整本小說',
                `系統會先把目前 ${novel.chapters.length} 章合併，再用這裡的規則重新切章。原本的章節切法會被取代。`,
                [
                    { text: '取消', style: 'cancel' },
                    { text: '開始重分割', style: 'destructive', onPress: performSplit }
                ]
            );
            return;
        }

        performSplit();
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <FlatList 
                data={novel.chapters}
                keyExtractor={(item, index) => index.toString()}
                ListHeaderComponent={
                    <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity
                            style={[styles.toolbarBtn, { backgroundColor: colors.primary }]}
                            onPress={openNovelSplitModal}
                            disabled={isProcessing}
                        >
                            <Feather name="scissors" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.toolbarBtnText}>整本重分割</Text>
                        </TouchableOpacity>
                    </View>
                }
                renderItem={({ item, index }) => {
                    const isCurrent = novel.progressIndex === index;
                    return (
                        <TouchableOpacity 
                            style={[
                                styles.item, 
                                { borderBottomColor: colors.border },
                                isCurrent && { backgroundColor: colors.highlight }
                            ]}
                            onPress={() => {
                                navigation.navigate('Reader', { novelId: novel.id, initialChapterIndex: index });
                            }}
                            onLongPress={() => handleLongPress(index)}
                        >
                            <Text style={[
                                styles.title,
                                { color: isCurrent ? colors.primary : colors.text },
                                isCurrent && { fontWeight: 'bold' }
                            ]}>
                                {item.title}
                            </Text>
                        </TouchableOpacity>
                    );
                }}
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
                        
                        <TouchableOpacity style={styles.optionBtn} onPress={handleDeleteChapter}>
                            <Feather name="trash-2" size={20} color="#FF3B30" style={styles.optionIcon} />
                            <Text style={{ color: "#FF3B30", fontSize: 16 }}>刪除此章節</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Split Modal */}
            <Modal visible={isSplitModalVisible} transparent={true} animationType="slide">
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
                        
                        <TouchableOpacity 
                            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isProcessing ? 0.7 : 1 }]} 
                            onPress={executeSplit}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.saveBtnText}>
                                    {splitTarget === 'novel' ? '開始重分割' : '開始分割'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Edit/Add Chapter Modal */}
            <Modal visible={isEditModalVisible} transparent={true} animationType="slide">
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
