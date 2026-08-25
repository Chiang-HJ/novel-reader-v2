import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, Button, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { getBookshelf, deleteNovel, getStorageUsage, moveNovelToFolder, batchMoveNovels, batchDeleteNovels, saveNovelToBookshelf, saveChapterText, updateNovelMetadata, getReadingStats } from '../utils/storage';
import { getFolders, createFolder } from '../utils/folderStorage';
import { createBackup, restoreBackup } from '../utils/BackupService';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';
import { useDownload } from '../context/DownloadContext';

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { parseEpub } from '../utils/epubParser';
import { convertS2T } from '../utils/opencc';
import { importLargeTxtNovel } from '../utils/txtImporter';
import { startBackgroundKeepAlive, stopBackgroundKeepAlive } from '../utils/backgroundKeepAlive';

import SearchBar from '../components/home/SearchBar';
import DownloadProgress from '../components/home/DownloadProgress';
import NovelListItem from '../components/home/NovelListItem';
import FolderListItem from '../components/home/FolderListItem';

export default function HomeScreen({ navigation }) {
    const { colors, isDark, themeName, availableThemes, changeTheme, themeId } = useTheme();
    const { startDownload, cancelDownload, activeTask, progressText, queue, bookshelfUpdated, pendingSelection, resumeDownload, cancelSelection, activeTaskProgress, retryChapterDownload, downloadingNovelId } = useDownload();
    
    const [searchInput, setSearchInput] = useState('');
    const [bookshelf, setBookshelf] = useState([]);
    const [folders, setFolders] = useState([]);
    const [storageUsage, setStorageUsage] = useState('計算中...');
    const [readingStats, setReadingStats] = useState({ totalSeconds: 0 });
    const [isBackingUp, setIsBackingUp] = useState(false);
    
    // For Chapter Selection Modal
    const [selectStartChapter, setSelectStartChapter] = useState('1');
    const [selectEndChapter, setSelectEndChapter] = useState('1');

    // For 7-day Sideload Timer
    const [sideloadDaysLeft, setSideloadDaysLeft] = useState(null);
    
    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
    const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
    const [selectedNovel, setSelectedNovel] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');

    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [importTitle, setImportTitle] = useState('');
    const [importText, setImportText] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({
        isVisible: false,
        percent: 0,
        statusText: '',
        current: 0,
        total: 0,
        currentTitle: '',
        title: ''
    });
    const [splitRegexStr, setSplitRegexStr] = useState('第[零一二三四五六七八九十百千0-9]+[章節][^\\n]*');
    const [splitExampleStr, setSplitExampleStr] = useState('1.');
    const [splitMode, setSplitMode] = useState('regex');

    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
            loadSideloadTimer();
        });
        return unsubscribe;
    }, [navigation]);

    useEffect(() => {
        loadBookshelf();
    }, [bookshelfUpdated]);

    useEffect(() => {
        if (pendingSelection) {
            const existingDownloaded = pendingSelection.existing ? (pendingSelection.existing.downloadedChapters || 0) : 0;
            const totalSource = pendingSelection.novelInfo?.chapters?.length || 0;
            const start = (existingDownloaded > 0 && existingDownloaded < totalSource) 
                ? (existingDownloaded + 1) 
                : 1;
            setSelectStartChapter(start.toString());
            setSelectEndChapter(totalSource.toString());
        }
    }, [pendingSelection]);

    const loadSideloadTimer = async () => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            let lastDateStr = await AsyncStorage.getItem('@sideload_date');
            if (!lastDateStr) {
                lastDateStr = Date.now().toString();
                await AsyncStorage.setItem('@sideload_date', lastDateStr);
            }
            const diffMs = Date.now() - parseInt(lastDateStr, 10);
            const daysPassed = diffMs / (1000 * 60 * 60 * 24);
            const left = 7 - daysPassed;
            setSideloadDaysLeft(left < 0 ? 0 : left);
        } catch (e) {
            console.error('Failed to load sideload timer', e);
        }
    };

    const handleResetSideloadTimer = async () => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.setItem('@sideload_date', Date.now().toString());
            await loadSideloadTimer();
            Alert.alert('已重置', '側載 7 天簽名倒數已重置為今天！');
        } catch (e) {
            Alert.alert('錯誤', '重置失敗: ' + e.message);
        }
    };

    const handleSubmitChapterSelection = () => {
        if (!pendingSelection) return;
        
        let start = parseInt(selectStartChapter, 10) - 1; // Convert 1-based to 0-based index
        let end = parseInt(selectEndChapter, 10); // end is exclusive in loop, so keep it as is
        
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end > pendingSelection.novelInfo.chapters.length) end = pendingSelection.novelInfo.chapters.length;
        
        if (start >= end) {
            Alert.alert('錯誤', '起始章節必須小於結束章節');
            return;
        }
        
        resumeDownload(start, end);
    };

    const loadBookshelf = async () => {
        try {
            const list = await getBookshelf();
            setBookshelf(list.filter(n => !n.folderId && !n.isHidden)); // Exclude hidden books and folders from main view
            setFolders(await getFolders());
            setStorageUsage(await getStorageUsage());
            setReadingStats(await getReadingStats());
        } catch (error) {
            console.error('Failed to load bookshelf:', error);
        }
    };

    const unlockVault = async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            
            if (hasHardware && isEnrolled) {
                const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: '解鎖私密金庫',
                    fallbackLabel: '使用密碼'
                });
                
                if (result.success) {
                    navigation.navigate('Vault');
                } else {
                    if (!supportedTypes.includes(2)) {
                        Alert.alert('Face ID 未啟用', '系統偵測不到可用的 Face ID。請到 iPhone 的「設定」>「Expo Go」，確認是否已經允許取用「Face ID」。\n\n(若失敗，將改用密碼登入)');
                    } else {
                        Alert.alert('解鎖失敗', '生物辨識失敗。');
                    }
                }
            } else {
                Alert.alert('解鎖失敗', '請先至系統設定中啟用生物辨識（Face ID / Touch ID）或設定密碼。');
            }
        } catch (e) {
            Alert.alert('解鎖發生錯誤', e.message);
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const newFolder = await createFolder(newFolderName.trim());
            setNewFolderName('');
            if (selectedNovel) {
                await moveNovelToFolder(selectedNovel.id, newFolder.id);
                setSelectedNovel(null);
            } else if (isSelectionMode && selectedIds.size > 0) {
                await batchMoveNovels(Array.from(selectedIds), newFolder.id);
                setSelectedIds(new Set());
                setIsSelectionMode(false);
            }
            setIsMoveModalVisible(false);
            await loadBookshelf();
        } catch (error) {
            Alert.alert('錯誤', '建立資料夾失敗');
        }
    };

    const handleMoveToFolder = async (folderId) => {
        try {
            if (selectedNovel) {
                await moveNovelToFolder(selectedNovel.id, folderId);
                setSelectedNovel(null);
            } else if (isSelectionMode && selectedIds.size > 0) {
                await batchMoveNovels(Array.from(selectedIds), folderId);
                setSelectedIds(new Set());
                setIsSelectionMode(false);
            }
            setIsMoveModalVisible(false);
            await loadBookshelf();
        } catch (error) {
            Alert.alert('錯誤', '移動失敗');
        }
    };

    const confirmDelete = (novel) => {
        Alert.alert(
            '刪除書籍',
            `確定要從書櫃中刪除《${novel.title}》嗎？（已下載的章節也會一併刪除）`,
            [
                { text: '取消', style: 'cancel' },
                { text: '刪除', style: 'destructive', onPress: async () => {
                    try {
                        await deleteNovel(novel.id);
                        await loadBookshelf();
                    } catch (error) {
                        Alert.alert('錯誤', '刪除失敗');
                    }
                }}
            ]
        );
    };

    const confirmBatchDelete = () => {
        if (selectedIds.size === 0) return;
        Alert.alert(
            '批次刪除',
            `確定要刪除選取的 ${selectedIds.size} 本書籍嗎？`,
            [
                { text: '取消', style: 'cancel' },
                { text: '刪除', style: 'destructive', onPress: async () => {
                    try {
                        await batchDeleteNovels(Array.from(selectedIds));
                        setIsSelectionMode(false);
                        setSelectedIds(new Set());
                        await loadBookshelf();
                    } catch (error) {
                        Alert.alert('錯誤', '刪除失敗');
                    }
                }}
            ]
        );
    };

    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSearchOrDownload = () => {
        const input = searchInput.trim();
        if (!input) return;
        
        if (input.startsWith('http://') || input.startsWith('https://')) {
            if (queue.some(q => q.url === input) || activeTask?.url === input) {
                Alert.alert('提示', '這個網址已經在下載序列中了');
            } else {
                startDownload(input);
            }
        } else {
            Alert.alert('輸入錯誤', '這不是網址，目前支援從狂人網與微風小說網下載 (例如 czbooks, wyblogs 等)。');
        }
        setSearchInput('');
    };


    const handleEditNovel = async () => {
        if (!selectedNovel) return;
        if (!editTitle.trim()) {
            Alert.alert('提示', '書名不能為空');
            return;
        }
        try {
            await updateNovelMetadata(selectedNovel.id, {
                title: editTitle.trim(),
                author: editAuthor.trim()
            });
            setIsOptionsModalVisible(false);
            setSelectedNovel(null);
            await loadBookshelf();
        } catch (error) {
            Alert.alert('錯誤', '更新失敗');
        }
    };


    const processLargeTextImport = async (title, rawContent) => {
        setIsImporting(true);
        setIsImportModalVisible(false);
        setImportProgress({
            isVisible: true,
            percent: 0,
            statusText: '正在分析章節目錄結構...',
            current: 0,
            total: 0,
            currentTitle: '',
            title: title.trim()
        });
        startBackgroundKeepAlive('txt_import');

        try {
            const result = await importLargeTxtNovel({
                title: title.trim(),
                rawContent,
                customRegexStr: splitRegexStr,
                splitMode,
                splitExampleStr,
                onProgress: (prog) => {
                    setImportProgress(prev => ({
                        ...prev,
                        ...prog,
                        isVisible: true,
                        title: title.trim()
                    }));
                }
            });

            await loadBookshelf();
            setImportProgress(prev => ({ ...prev, isVisible: false }));
            setImportTitle('');
            setImportText('');
            Alert.alert('匯入成功', `《${result.title}》已成功匯入書櫃，共 ${result.chapterCount} 章！`);
        } catch (error) {
            setImportProgress(prev => ({ ...prev, isVisible: false }));
            Alert.alert('匯入失敗', error.message || '處理檔案時發生錯誤');
        } finally {
            setIsImporting(false);
            stopBackgroundKeepAlive('txt_import');
        }
    };

    const handleImportText = () => {
        if (!importTitle.trim()) {
            Alert.alert('提示', '請輸入小說名稱');
            return;
        }
        if (!importText.trim()) {
            Alert.alert('提示', '請輸入或貼上小說內容');
            return;
        }
        processLargeTextImport(importTitle, importText);
    };

    const handleFileImport = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/plain', 'application/epub+zip', 'application/epub'],
                copyToCacheDirectory: true
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const file = result.assets[0];
            
            if (file.name.toLowerCase().endsWith('.epub')) {
                // Handle EPUB with live progress
                const baseTitle = file.name.replace(/\.epub$/i, '');
                setImportProgress({
                    isVisible: true,
                    percent: 5,
                    statusText: '正在解析 EPUB 結構...',
                    current: 0,
                    total: 0,
                    currentTitle: '',
                    title: baseTitle
                });
                startBackgroundKeepAlive('txt_import');

                try {
                    const parsed = await parseEpub(file.uri, (current, total, msg) => {
                        setImportProgress({
                            isVisible: true,
                            percent: Math.min(50, Math.round((current / (total || 1)) * 50)),
                            statusText: msg,
                            current,
                            total,
                            currentTitle: '',
                            title: baseTitle
                        });
                    });
                    const novelId = 'novel_epub_' + Date.now();
                    const total = parsed.chapters.length;

                    for (let i = 0; i < total; i++) {
                        await saveChapterText(novelId, i, parsed.chapters[i].title, parsed.chapters[i].text);
                        if (i % 20 === 0 || i === total - 1) {
                            setImportProgress({
                                isVisible: true,
                                percent: 50 + Math.round(((i + 1) / total) * 50),
                                statusText: `正在寫入章節 (${i + 1} / ${total})`,
                                current: i + 1,
                                total,
                                currentTitle: parsed.chapters[i].title,
                                title: parsed.title
                            });
                            await new Promise(r => setTimeout(r, 0));
                        }
                    }
                    
                    const novelInfo = {
                        id: novelId,
                        title: parsed.title,
                        author: parsed.author,
                        cover: '',
                        url: 'local_epub',
                        chapters: parsed.chapters.map((c, i) => ({ title: c.title, url: `local_${i}` })),
                        chapterCount: parsed.chapters.length,
                        downloadedChapters: parsed.chapters.length,
                    };
                    
                    await saveNovelToBookshelf(novelInfo);
                    await loadBookshelf();
                    setImportProgress(prev => ({ ...prev, isVisible: false }));
                    Alert.alert('成功', `EPUB《${parsed.title}》匯入完成！`);
                } catch (e) {
                    setImportProgress(prev => ({ ...prev, isVisible: false }));
                    Alert.alert('錯誤', '無法解析 EPUB 檔案: ' + e.message);
                } finally {
                    stopBackgroundKeepAlive('txt_import');
                }
            } else if (file.name.toLowerCase().endsWith('.txt')) {
                // Handle TXT with live progress
                const baseName = file.name.replace(/\.txt$/i, '');
                setImportProgress({
                    isVisible: true,
                    percent: 2,
                    statusText: '正在讀取文字檔內容...',
                    current: 0,
                    total: 0,
                    currentTitle: '',
                    title: baseName
                });
                
                await new Promise(r => setTimeout(r, 50));
                const txtContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
                await processLargeTextImport(baseName, txtContent);
            } else {
                Alert.alert('不支援的格式', '目前只支援 .txt 與 .epub 檔案');
            }
        } catch (error) {
            setImportProgress(prev => ({ ...prev, isVisible: false }));
            Alert.alert('錯誤', '選取檔案時發生問題: ' + error.message);
        }
    };

    const filteredBookshelf = React.useMemo(() => {
        return bookshelf.filter(novel => {
            // Apply search filter (unless searchInput is a URL)
            if (searchInput.trim() && !searchInput.trim().startsWith('http')) {
                const query = searchInput.trim().toLowerCase();
                return (novel.title && novel.title.toLowerCase().includes(query)) || 
                       (novel.author && novel.author.toLowerCase().includes(query));
            }
            return true;
        });
    }, [bookshelf, searchInput]);

    const flatListContentContainerStyle = React.useMemo(() => ({ 
        paddingBottom: isSelectionMode ? 100 : 40, 
        paddingTop: 130 
    }), [isSelectionMode]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            
            {/* Pinned Glassmorphism Header */}
            <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={styles.pinnedHeader}>
                <View style={styles.appHeader}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                        <TouchableOpacity onLongPress={unlockVault} activeOpacity={0.8}>
                            <Text style={[styles.appTitle, { color: colors.text }]}>聽小說</Text>
                        </TouchableOpacity>

                        {sideloadDaysLeft !== null && (
                            <TouchableOpacity onPress={handleResetSideloadTimer}>
                                <View style={{
                                    backgroundColor: sideloadDaysLeft <= 2 ? '#FF3B30' : (isDark ? '#333' : '#eee'),
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 12
                                }}>
                                    <Text style={{
                                        color: sideloadDaysLeft <= 2 ? '#fff' : colors.textSecondary,
                                        fontSize: 12,
                                        fontWeight: 'bold'
                                    }}>
                                        憑證: {Math.max(0, sideloadDaysLeft).toFixed(1)} 天
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={() => setIsSettingsModalVisible(true)} style={[styles.themeBtn, { backgroundColor: colors.surface }]}>
                            <Feather name="settings" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>設定</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </BlurView>

            <FlatList 
                data={filteredBookshelf}
                keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
                contentContainerStyle={flatListContentContainerStyle}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                renderItem={({ item }) => (
                    <NovelListItem 
                        item={item}
                        onPress={() => {
                            if (isSelectionMode) {
                                toggleSelection(item.id);
                            } else {
                                if (item.type === 'comic') {
                                    navigation.navigate('ComicReader', { novelId: item.id, title: item.title });
                                } else {
                                    navigation.navigate('Reader', { novelId: item.id, title: item.title });
                                }
                            }
                        }}
                        onLongPress={() => {
                            if (!isSelectionMode) {
                                setSelectedNovel(item);
                                setEditTitle(item.title);
                                setEditAuthor(item.author || '');
                                setIsOptionsModalVisible(true);
                            }
                        }}
                        onMove={() => { setSelectedNovel(item); setIsMoveModalVisible(true); }}
                        onDelete={() => confirmDelete(item)}
                        onAuthorPress={(author) => {
                            if (item.type === 'comic') {
                                navigation.navigate('JMComicFeed', { initialQuery: author });
                            } else {
                                setSearchInput(author);
                            }
                        }}
                        colors={colors}
                        isDark={isDark}
                        customActions={isSelectionMode ? (
                            <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                                <Feather name={selectedIds.has(item.id) ? "check-square" : "square"} size={24} color={selectedIds.has(item.id) ? colors.primary : colors.textSecondary} />
                            </View>
                        ) : null}
                    />
                )}
                ListHeaderComponent={
                    <View>
                        <View style={{ height: 10 }} />

                        <SearchBar 
                            searchInput={searchInput} 
                            setSearchInput={setSearchInput} 
                            onSearch={handleSearchOrDownload} 
                            onImportText={() => setIsImportModalVisible(true)}
                            onImportFile={handleFileImport}
                            colors={colors} 
                        />


                        <DownloadProgress 
                            queue={queue} 
                            activeTask={activeTask} 
                            progressText={progressText} 
                            cancelDownload={cancelDownload} 
                            colors={colors} 
                            activeTaskProgress={activeTaskProgress}
                            retryChapterDownload={retryChapterDownload}
                            novelId={downloadingNovelId}
                        />
                        
                        <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>我的書架</Text>
                            </View>
                            
                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                                <Text style={[styles.storageText, { color: colors.textSecondary, marginBottom: 0 }]}>使用空間: {storageUsage}</Text>
                                <TouchableOpacity onPress={() => setIsSelectionMode(!isSelectionMode)}>
                                    <Text style={{ color: isSelectionMode ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>
                                        {isSelectionMode ? '取消選取' : '批次管理'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {folders.map(folder => (
                            <FolderListItem 
                                key={folder.id}
                                folder={folder}
                                onPress={() => navigation.navigate('Folder', { folderId: folder.id, folderName: folder.name })}
                                colors={colors}
                            />
                        ))}
                    </View>
                }
                ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>書櫃目前沒有尚未分類的小數。</Text>}
            />
            
            {/* Batch Action Bottom Bar */}
            {isSelectionMode && (
                <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: 20, paddingBottom: 40,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>已選取 {selectedIds.size} 本</Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                        <TouchableOpacity 
                            style={{ padding: 15, backgroundColor: colors.surface, borderRadius: 8 }}
                            disabled={selectedIds.size === 0}
                            onPress={() => { setIsMoveModalVisible(true); }}
                        >
                            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>移動至</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={{ padding: 15, backgroundColor: '#FF3B30', borderRadius: 8 }}
                            disabled={selectedIds.size === 0}
                            onPress={confirmBatchDelete}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>批次刪除</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            )}

            {/* Move Modal */}
            <Modal visible={isMoveModalVisible} transparent={true} animationType="fade">
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)', borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>移動《{selectedNovel?.title || (selectedIds.size > 0 ? selectedIds.size + ' 本選取書籍' : '')}》</Text>
                        
                        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                            <TextInput 
                                style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                placeholder="新增資料夾..."
                                placeholderTextColor={colors.textSecondary}
                                value={newFolderName}
                                onChangeText={setNewFolderName}
                            />
                            <Button title="新增" onPress={handleCreateFolder} color={colors.primary} />
                        </View>
                        
                        <FlatList 
                            data={[{ id: 'vault', name: '㊙️ 隱藏金庫 (需解鎖)' }, ...folders]}
                            keyExtractor={item => item.id}
                            style={{ maxHeight: 200 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={[styles.modalFolderItem, { borderBottomColor: colors.border }]}
                                    onPress={() => handleMoveToFolder(item.id)}
                                >
                                    <Feather name={item.id === 'vault' ? "lock" : "folder"} size={20} color={colors.primary} style={{ marginRight: 12 }} />
                                    <Text style={{ color: colors.text, fontSize: 16 }} numberOfLines={1}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        
                        <Button title="取消" onPress={() => setIsMoveModalVisible(false)} color={colors.textSecondary} />
                    </View>
                </BlurView>
            </Modal>

            {/* Settings Modal */}
            <Modal visible={isSettingsModalVisible} transparent={true} animationType="fade">
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)', borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 16 }]}>外觀主題</Text>
                        {availableThemes.map(t => (
                            <TouchableOpacity 
                                key={t.id}
                                style={[styles.modalFolderItem, { borderBottomColor: colors.border, backgroundColor: themeId === t.id ? colors.background : 'transparent', borderRadius: 12, paddingHorizontal: 12 }]}
                                onPress={() => { changeTheme(t.id); }}
                            >
                                <Feather name={themeId === t.id ? "check-circle" : "circle"} size={20} color={themeId === t.id ? colors.primary : colors.textSecondary} style={{ marginRight: 12 }} />
                                <Text style={{ color: colors.text, fontSize: 16 }}>{t.name}</Text>
                            </TouchableOpacity>
                        ))}
                        
                        <Text style={[styles.modalTitle, { color: colors.text, marginTop: 24, marginBottom: 16 }]}>閱讀統計</Text>
                        <View style={[styles.modalFolderItem, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}>
                            <Feather name="clock" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>總閱讀時間: {Math.floor(readingStats.totalSeconds / 3600)}小時 {Math.floor((readingStats.totalSeconds % 3600) / 60)}分鐘</Text>
                        </View>
                        
                        <Text style={[styles.modalTitle, { color: colors.text, marginTop: 24, marginBottom: 16 }]}>資料與備份</Text>
                        <TouchableOpacity 
                            style={[styles.modalFolderItem, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}
                            onPress={async () => {
                                setIsBackingUp(true);
                                await createBackup();
                                setIsBackingUp(false);
                                setIsSettingsModalVisible(false);
                            }}
                            disabled={isBackingUp}
                        >
                            <Feather name="upload-cloud" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>{isBackingUp ? '備份中...' : '備份書架與設定'}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={[styles.modalFolderItem, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}
                            onPress={async () => {
                                const success = await restoreBackup();
                                if (success) {
                                    setIsSettingsModalVisible(false);
                                    loadBookshelf();
                                }
                            }}
                        >
                            <Feather name="download-cloud" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                            <Text style={{ color: colors.text, fontSize: 16 }}>從備份檔還原</Text>
                        </TouchableOpacity>

                        <Text style={[styles.modalTitle, { color: colors.text, marginTop: 24, marginBottom: 16 }]}>側載簽名管理 (7天驗證)</Text>
                        <View style={[styles.modalFolderItem, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}>
                            <Feather name="shield" size={20} color={sideloadDaysLeft !== null && sideloadDaysLeft <= 2 ? '#FF3B30' : colors.primary} style={{ marginRight: 12 }} />
                            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>
                                {sideloadDaysLeft !== null 
                                    ? (sideloadDaysLeft <= 0 
                                        ? '⚠️ 簽名已到期，請接電腦重新驗證/簽名！' 
                                        : `剩餘時間: ${Math.floor(sideloadDaysLeft)} 天 ${Math.floor((sideloadDaysLeft % 1) * 24)} 小時`)
                                    : '計算中...'}
                            </Text>
                        </View>
                        <TouchableOpacity 
                            style={[styles.modalFolderItem, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}
                            onPress={handleResetSideloadTimer}
                        >
                            <Feather name="refresh-cw" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>插電腦重簽完成，重置 7 天倒數</Text>
                        </TouchableOpacity>
                        
                        <View style={{ marginTop: 24 }}>
                            <Button title="關閉" onPress={() => setIsSettingsModalVisible(false)} color={colors.textSecondary} />
                        </View>
                    </View>
                </BlurView>
            </Modal>
            {/* Import Text Modal */}
            <Modal visible={isImportModalVisible} transparent={true} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={[styles.modalContent, { backgroundColor: colors.surface, height: '80%', padding: 20 }]}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]} numberOfLines={1}>手動匯入小說</Text>
                            <TouchableOpacity onPress={() => setIsImportModalVisible(false)} style={{padding: 5}} hitSlop={{top:15,bottom:15,left:15,right:15}}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={{flex: 1, width: '100%'}}>
                            <TextInput
                                style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 15, height: 50, borderRadius: 8, paddingHorizontal: 15 }]}
                                placeholder="請輸入小說名稱..."
                                placeholderTextColor={colors.textSecondary}
                                value={importTitle}
                                onChangeText={setImportTitle}
                            />
                            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                                <TouchableOpacity 
                                    style={{ flex: 1, padding: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: splitMode === 'regex' ? colors.primary : 'transparent' }}
                                    onPress={() => setSplitMode('regex')}
                                >
                                    <Text style={{ color: splitMode === 'regex' ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>規則分割</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={{ flex: 1, padding: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: splitMode === 'example' ? colors.primary : 'transparent' }}
                                    onPress={() => setSplitMode('example')}
                                >
                                    <Text style={{ color: splitMode === 'example' ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>範例分割</Text>
                                </TouchableOpacity>
                            </View>

                            {splitMode === 'example' ? (
                                <>
                                    <Text style={{ color: colors.textSecondary, marginBottom: 5, fontSize: 12 }}>請輸入章節的編號範例 (例如: 1. 或 第1章)：</Text>
                                    <TextInput
                                        style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 15, height: 40, borderRadius: 8, paddingHorizontal: 15 }]}
                                        placeholder="例如: 1."
                                        placeholderTextColor={colors.textSecondary}
                                        value={splitExampleStr}
                                        onChangeText={setSplitExampleStr}
                                    />
                                </>
                            ) : (
                                <>
                                    <Text style={{ color: colors.textSecondary, marginBottom: 5, fontSize: 12 }}>章節分割規則 (Regular Expression)：</Text>
                                    <TextInput
                                        style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 15, height: 40, borderRadius: 8, paddingHorizontal: 15 }]}
                                        placeholder="正則表達式"
                                        placeholderTextColor={colors.textSecondary}
                                        value={splitRegexStr}
                                        onChangeText={setSplitRegexStr}
                                    />
                                </>
                            )}
                            <TextInput
                                style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, flex: 1, textAlignVertical: 'top', padding: 15, borderRadius: 8, marginBottom: 15 }]}
                                placeholder={"請貼上整本小說的純文字內容...\n(系統將自動依據『第X章』來切割章節)"}
                                placeholderTextColor={colors.textSecondary}
                                value={importText}
                                onChangeText={setImportText}
                                multiline={true}
                            />
                            <TouchableOpacity 
                                style={[{ backgroundColor: colors.primary, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center', opacity: isImporting ? 0.7 : 1 }]} 
                                onPress={handleImportText}
                                disabled={isImporting}
                            >
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>
                                    {isImporting ? '解析並匯入中...' : '開始解析並匯入'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
            
            {/* Chapter Selection Modal */}
            <Modal visible={!!pendingSelection} transparent={true} animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={[styles.modalContent, { backgroundColor: colors.surface, padding: 20 }]}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]} numberOfLines={1}>選擇下載章節</Text>
                        </View>
                        
                        <Text style={{color: colors.textSecondary, marginBottom: 10, fontSize: 14}}>
                            《{pendingSelection?.novelInfo?.title}》共 {pendingSelection?.novelInfo?.chapters?.length} 章
                        </Text>
                        
                        {pendingSelection?.existing && (pendingSelection.existing.downloadedChapters > 0) && (
                            <View style={{ backgroundColor: colors.primary + '20', padding: 8, borderRadius: 6, marginBottom: 15 }}>
                                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                                    ✨ 上次已下載至第 {pendingSelection.existing.downloadedChapters} 章（已為您自動接續）
                                </Text>
                            </View>
                        )}

                        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10}}>
                            <Text style={{color: colors.text}}>從第</Text>
                            <TextInput
                                style={[{ flex: 1, color: colors.text, borderColor: colors.border, borderWidth: 1, height: 40, borderRadius: 8, paddingHorizontal: 10, textAlign: 'center' }]}
                                value={selectStartChapter}
                                onChangeText={setSelectStartChapter}
                                keyboardType="number-pad"
                            />
                            <Text style={{color: colors.text}}>章，到第</Text>
                            <TextInput
                                style={[{ flex: 1, color: colors.text, borderColor: colors.border, borderWidth: 1, height: 40, borderRadius: 8, paddingHorizontal: 10, textAlign: 'center' }]}
                                value={selectEndChapter}
                                onChangeText={setSelectEndChapter}
                                keyboardType="number-pad"
                            />
                            <Text style={{color: colors.text}}>章</Text>
                        </View>

                        <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={cancelSelection}
                            >
                                <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={handleSubmitChapterSelection}
                            >
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>確定下載</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
            {/* Options Modal */}
            <Modal visible={isOptionsModalVisible} transparent={true} animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsOptionsModalVisible(false)} />
                    <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={[styles.modalContent, { backgroundColor: colors.surface, padding: 20 }]}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]} numberOfLines={1}>編輯書籍資訊</Text>
                            <TouchableOpacity onPress={() => setIsOptionsModalVisible(false)} style={{padding: 5}} hitSlop={{top:15,bottom:15,left:15,right:15}}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={{color: colors.textSecondary, marginBottom: 8, fontSize: 14}}>書名</Text>
                        <TextInput
                            style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 15, height: 50, borderRadius: 8, paddingHorizontal: 15 }]}
                            value={editTitle}
                            onChangeText={setEditTitle}
                        />

                        <Text style={{color: colors.textSecondary, marginBottom: 8, fontSize: 14}}>作者</Text>
                        <TextInput
                            style={[{ color: colors.text, borderColor: colors.border, borderWidth: 1, marginBottom: 20, height: 50, borderRadius: 8, paddingHorizontal: 15 }]}
                            value={editAuthor}
                            onChangeText={setEditAuthor}
                        />

                        <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={handleEditNovel}
                            >
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>儲存變更</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>

            {/* Live Import Progress Modal */}
            <Modal visible={importProgress.isVisible} transparent={true} animationType="fade">
                <BlurView intensity={isDark ? 80 : 60} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, padding: 24, borderRadius: 20, alignItems: 'center' }]}>
                        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                            <Feather name="book-open" size={28} color={colors.primary} />
                        </View>
                        
                        <Text style={[styles.modalTitle, { color: colors.text, fontSize: 18, marginBottom: 8, textAlign: 'center' }]} numberOfLines={1}>
                            正在匯入《{importProgress.title}》
                        </Text>
                        
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
                            {importProgress.statusText || '正在處理中...'}
                        </Text>

                        {/* Progress Bar */}
                        <View style={{ width: '100%', height: 8, backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                            <View style={{ width: `${importProgress.percent}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 4 }} />
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                                {importProgress.percent}%
                            </Text>
                            {importProgress.total > 0 && (
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                                    {importProgress.current} / {importProgress.total} 章
                                </Text>
                            )}
                        </View>

                        {importProgress.currentTitle ? (
                            <View style={{ backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, width: '100%', marginTop: 4 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                                    📝 當前：{importProgress.currentTitle}
                                </Text>
                            </View>
                        ) : null}

                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
                            🌙 已啟用防休眠保護，請稍候片刻...
                        </Text>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pinnedHeader: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150,150,150,0.2)'
    },
    appHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20
    },
    appTitle: { 
        fontSize: 34, 
        fontWeight: '800', 
        letterSpacing: 1 
    },
    headerActions: { 
        flexDirection: 'row', 
        alignItems: 'center' 
    },
    iconBtn: { 
        padding: 8, 
        marginRight: 8 
    },
    themeBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 10, 
        paddingHorizontal: 16, 
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    sectionHeader: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'flex-end', 
        marginBottom: 20,
        marginTop: 10,
        paddingHorizontal: 20
    },
    sectionTitle: { 
        fontSize: 24, 
        fontWeight: '700',
        letterSpacing: 0.5
    },
    storageText: { 
        fontSize: 13, 
        fontWeight: '500',
        marginBottom: 2
    },
    modalOverlay: { flex: 1, justifyContent: 'center', padding: 20 },
    modalContent: { borderRadius: 24, padding: 24, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
    modalInput: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, marginRight: 8 },
    modalBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
    modalFolderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    scraperBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    }
});
