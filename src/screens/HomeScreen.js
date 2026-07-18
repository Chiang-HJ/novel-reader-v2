import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, Button, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { getBookshelf, deleteNovel, getStorageUsage, moveNovelToFolder, saveNovelToBookshelf, saveChapterText, updateNovelMetadata, getReadingStats } from '../utils/storage';
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

import SearchBar from '../components/home/SearchBar';
import DownloadProgress from '../components/home/DownloadProgress';
import NovelListItem from '../components/home/NovelListItem';
import FolderListItem from '../components/home/FolderListItem';

export default function HomeScreen({ navigation }) {
    const { colors, isDark, themeName, availableThemes, changeTheme, themeId } = useTheme();
    const { startDownload, cancelDownload, activeTask, progressText, queue, bookshelfUpdated } = useDownload();
    
    const [searchInput, setSearchInput] = useState('');
    const [bookshelf, setBookshelf] = useState([]);
    const [folders, setFolders] = useState([]);
    const [storageUsage, setStorageUsage] = useState('計算中...');
    const [readingStats, setReadingStats] = useState({ totalSeconds: 0 });
    const [isBackingUp, setIsBackingUp] = useState(false);
    
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
    const [splitRegexStr, setSplitRegexStr] = useState('第[零一二三四五六七八九十百千0-9]+[章節][^\\n]*');
    const [splitExampleStr, setSplitExampleStr] = useState('1.');
    const [splitMode, setSplitMode] = useState('regex');

    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
        });
        return unsubscribe;
    }, [navigation]);

    useEffect(() => {
        loadBookshelf();
    }, [bookshelfUpdated]);

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
                for (const id of selectedIds) {
                    await moveNovelToFolder(id, newFolder.id);
                }
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
                for (const id of selectedIds) {
                    await moveNovelToFolder(id, folderId);
                }
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
                        for (const id of selectedIds) {
                            await deleteNovel(id);
                        }
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
        try {
            const novelId = 'manual_' + Date.now();
            let chapters = [];
            
            // Yield UI
            await new Promise(resolve => setTimeout(resolve, 10));

            // Normalize newlines and convert to Traditional Chinese
            let textData = rawContent.replace(/\r\n/g, '\n');
            textData = convertS2T(textData);

            // Yield UI
            await new Promise(resolve => setTimeout(resolve, 10));

            let headingRegex;
            try {
                let finalRegexStr = splitRegexStr;
                if (splitMode === 'example') {
                    if (!splitExampleStr.trim()) {
                        setIsImporting(false);
                        return;
                    }
                    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    finalRegexStr = escapeRegExp(splitExampleStr.trim()).replace(/\d+/g, '\\d+');
                }
                headingRegex = new RegExp('(' + finalRegexStr + ')', 'g');
            } catch (e) {
                Alert.alert('規則錯誤', '您輸入的章節分割規則格式有誤。');
                setIsImporting(false);
                return;
            }

            const parts = textData.split(headingRegex);

            if (parts.length > 1) {
                let chapterIndex = 0;
                
                if (parts[0].trim().length > 0) {
                    chapters.push({ title: '前言/簡介', url: 'manual_' + chapterIndex, id: chapterIndex });
                    await saveChapterText(novelId, chapterIndex, '前言/簡介', parts[0].trim());
                    chapterIndex++;
                }

                for (let i = 1; i < parts.length; i += 2) {
                    const chTitle = parts[i].trim();
                    const textContent = parts[i + 1] ? parts[i + 1].trim() : '';
                    
                    if (textContent.length === 0) continue;

                    chapters.push({ title: chTitle, url: 'manual_' + chapterIndex, id: chapterIndex });
                    await saveChapterText(novelId, chapterIndex, chTitle, textContent);
                    chapterIndex++;

                    if (i % 50 === 1) {
                        await new Promise(resolve => setTimeout(resolve, 0)); // Yield UI
                    }
                }
            } else {
                const lines = textData.trim().split('\n');
                const MAX_CHARS = 10000;
                let currentChunkLines = [];
                let currentLength = 0;
                let chapterIndex = 0;

                for (let i = 0; i < lines.length; i++) {
                    currentChunkLines.push(lines[i]);
                    currentLength += lines[i].length + 1;

                    if (currentLength > MAX_CHARS) {
                        const chTitle = `第 ${chapterIndex + 1} 部分`;
                        const chunkText = currentChunkLines.join('\n');
                        chapters.push({ title: chTitle, url: 'manual_' + chapterIndex, id: chapterIndex });
                        await saveChapterText(novelId, chapterIndex, chTitle, chunkText);
                        chapterIndex++;
                        currentChunkLines = [];
                        currentLength = 0;
                        await new Promise(resolve => setTimeout(resolve, 0)); // Yield UI
                    }
                }
                if (currentChunkLines.length > 0) {
                    const chTitle = `第 ${chapterIndex + 1} 部分`;
                    chapters.push({ title: chTitle, url: 'manual_' + chapterIndex, id: chapterIndex });
                    await saveChapterText(novelId, chapterIndex, chTitle, currentChunkLines.join('\n'));
                }
            }

            const novelInfo = {
                id: novelId,
                title: title.trim(),
                author: '自訂匯入',
                cover: '',
                url: 'manual',
                chapters,
                chapterCount: chapters.length,
                downloadedChapters: chapters.length,
            };

            await saveNovelToBookshelf(novelInfo);
            setIsImportModalVisible(false);
            setImportTitle('');
            setImportText('');
            loadBookshelf();
            
            Alert.alert('成功', '小說匯入完成！');
        } catch (error) {

            Alert.alert('錯誤', '匯入過程中發生問題');
        } finally {
            setIsImporting(false);
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
            setIsImporting(true);
            
            if (file.name.toLowerCase().endsWith('.epub')) {
                // Handle EPUB
                try {
                    const parsed = await parseEpub(file.uri);
                    const novelId = 'novel_epub_' + Date.now();
                    
                    for (let i = 0; i < parsed.chapters.length; i++) {
                        await saveChapterText(novelId, i, parsed.chapters[i].title, parsed.chapters[i].text);
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
                    loadBookshelf();
                    Alert.alert('成功', 'EPUB 匯入完成！');
                } catch (e) {

                    Alert.alert('錯誤', '無法解析 EPUB 檔案: ' + e.message);
                }
            } else if (file.name.toLowerCase().endsWith('.txt')) {
                // Handle TXT
                const txtContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
                const baseName = file.name.replace('.txt', '');
                
                Alert.alert(
                    '確認匯入',
                    `即將匯入文字檔：${file.name}\n\n(系統將使用您在手動匯入視窗中設定的「章節分割規則」來切分)`,
                    [
                        { text: '取消', style: 'cancel' },
                        { 
                            text: '開始匯入', 
                            onPress: () => processLargeTextImport(baseName, txtContent) 
                        }
                    ]
                );
            } else {
                Alert.alert('不支援的格式', '目前只支援 .txt 與 .epub 檔案');
            }
        } catch (error) {

            Alert.alert('錯誤', '選取檔案時發生問題');
        } finally {
            setIsImporting(false);
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

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            
            {/* Pinned Glassmorphism Header */}
            <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={styles.pinnedHeader}>
                <View style={styles.appHeader}>
                    <TouchableOpacity onLongPress={unlockVault} activeOpacity={0.8}>
                        <Text style={[styles.appTitle, { color: colors.text }]}>聽小說</Text>
                    </TouchableOpacity>
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
                contentContainerStyle={{ paddingBottom: isSelectionMode ? 100 : 40, paddingTop: 130 }}
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
                        
                        <View style={{ marginTop: 24 }}>
                            <Button title="關閉" onPress={() => setIsSettingsModalVisible(false)} color={colors.textSecondary} />
                        </View>
                    </View>
                </BlurView>
            </Modal>
            {/* Import Text Modal */}
            <Modal visible={isImportModalVisible} transparent={true} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, height: '80%', padding: 20 }]}>
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
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            {/* Options Modal */}
            <Modal visible={isOptionsModalVisible} transparent={true} animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsOptionsModalVisible(false)} />
                    <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: colors.surface, padding: 20 }]}>
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
