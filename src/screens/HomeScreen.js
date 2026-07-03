import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, Button } from 'react-native';
import { getBookshelf, deleteNovel, getStorageUsage, moveNovelToFolder } from '../utils/storage';
import { getFolders, createFolder } from '../utils/folderStorage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../context/ThemeContext';
import { useDownload } from '../context/DownloadContext';

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
    
    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
    const [isThemeModalVisible, setIsThemeModalVisible] = useState(false);
    const [selectedNovel, setSelectedNovel] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');

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
        const list = await getBookshelf();
        setBookshelf(list.filter(n => !n.folderId)); // Only show uncategorized novels
        setFolders(await getFolders());
        setStorageUsage(await getStorageUsage());
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
                Alert.alert('解鎖提示', '因環境限制，直接為您開啟金庫', [{ text: '確定', onPress: () => navigation.navigate('Vault') }]);
            }
        } catch (e) {
            Alert.alert('解鎖發生錯誤', e.message + '\n\n直接為您進入金庫！');
            navigation.navigate('Vault');
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const newFolder = await createFolder(newFolderName.trim());
        setNewFolderName('');
        if (selectedNovel) {
            await moveNovelToFolder(selectedNovel.id, newFolder.id);
            setIsMoveModalVisible(false);
            setSelectedNovel(null);
        }
        loadBookshelf();
    };

    const handleMoveToFolder = async (folderId) => {
        if (selectedNovel) {
            await moveNovelToFolder(selectedNovel.id, folderId);
            setIsMoveModalVisible(false);
            setSelectedNovel(null);
            loadBookshelf();
        }
    };

    const confirmDelete = (novel) => {
        Alert.alert(
            '刪除書籍',
            `確定要從書櫃中刪除《${novel.title}》嗎？（已下載的章節也會一併刪除）`,
            [
                { text: '取消', style: 'cancel' },
                { text: '刪除', style: 'destructive', onPress: async () => {
                    await deleteNovel(novel.id);
                    loadBookshelf();
                }}
            ]
        );
    };

    const handleSearchOrDownload = () => {
        const input = searchInput.trim();
        if (!input) return;
        
        if ((input.startsWith('http://') || input.startsWith('https://')) && input.includes('czbooks')) {
            if (queue.some(q => q.url === input) || activeTask?.url === input) {
                Alert.alert('提示', '這個網址已經在下載排程中囉！');
            } else {
                startDownload(input);
            }
        } else {
            Alert.alert('輸入錯誤', '為確保穩定性，目前僅支援「貼上小說狂人 (czbooks) 的網址」進行下載，暫時移除書名搜尋功能。');
        }
        setSearchInput('');
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            
            {/* Pinned Glassmorphism Header */}
            <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={styles.pinnedHeader}>
                <View style={styles.appHeader}>
                    <TouchableOpacity onLongPress={unlockVault} activeOpacity={0.8}>
                        <Text style={[styles.appTitle, { color: colors.text }]}>聽小說</Text>
                    </TouchableOpacity>
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={() => setIsThemeModalVisible(true)} style={[styles.themeBtn, { backgroundColor: colors.surface }]}>
                            <Feather name="aperture" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>{themeName}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </BlurView>

            <FlatList 
                data={bookshelf}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingBottom: 40, paddingTop: 130 }}
                renderItem={({ item }) => (
                    <NovelListItem 
                        item={item}
                        onPress={() => navigation.navigate('Reader', { novelId: item.id, title: item.title })}
                        onMove={() => { setSelectedNovel(item); setIsMoveModalVisible(true); }}
                        onDelete={() => confirmDelete(item)}
                        colors={colors}
                        isDark={isDark}
                    />
                )}
                ListHeaderComponent={
                    <View>
                        <View style={{ height: 10 }} />

                        <SearchBar 
                            searchInput={searchInput} 
                            setSearchInput={setSearchInput} 
                            onSearch={handleSearchOrDownload} 
                            colors={colors} 
                        />
                        
                        <DownloadProgress 
                            queue={queue} 
                            activeTask={activeTask} 
                            progressText={progressText} 
                            cancelDownload={cancelDownload} 
                            colors={colors} 
                        />
                        
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>我的書櫃</Text>
                            <Text style={[styles.storageText, { color: colors.textSecondary }]}>使用空間: {storageUsage}</Text>
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
                ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>書櫃目前沒有尚未分類的小說。</Text>}
            />
            
            {/* Move Modal */}
            <Modal visible={isMoveModalVisible} transparent={true} animationType="fade">
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)', borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>移動《{selectedNovel?.title}》</Text>
                        
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
                                    <Text style={{ color: colors.text, fontSize: 16 }}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        
                        <Button title="取消" onPress={() => setIsMoveModalVisible(false)} color={colors.textSecondary} />
                    </View>
                </BlurView>
            </Modal>

            {/* Theme Modal */}
            <Modal visible={isThemeModalVisible} transparent={true} animationType="fade">
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)', borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 16 }]}>切換主題風格</Text>
                        {availableThemes.map(t => (
                            <TouchableOpacity 
                                key={t.id}
                                style={[styles.modalFolderItem, { borderBottomColor: colors.border, backgroundColor: themeId === t.id ? colors.background : 'transparent', borderRadius: 12, paddingHorizontal: 12 }]}
                                onPress={() => { changeTheme(t.id); setIsThemeModalVisible(false); }}
                            >
                                <Feather name={themeId === t.id ? "check-circle" : "circle"} size={20} color={themeId === t.id ? colors.primary : colors.textSecondary} style={{ marginRight: 12 }} />
                                <Text style={{ color: colors.text, fontSize: 16 }}>{t.name}</Text>
                            </TouchableOpacity>
                        ))}
                        <View style={{ marginTop: 16 }}>
                            <Button title="關閉" onPress={() => setIsThemeModalVisible(false)} color={colors.textSecondary} />
                        </View>
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
    modalFolderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 }
});
