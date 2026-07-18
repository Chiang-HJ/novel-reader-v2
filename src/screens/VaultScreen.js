import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image, Modal, PanResponder, Dimensions, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { getBookshelf, deleteNovel, updateNovelMetadata } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import NovelListItem from '../components/home/NovelListItem';

const VAULT_MEDIA_KEY = '@vault_media';
const VAULT_TAGS_KEY = '@vault_tags';

export default function VaultScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const [activeTab, setActiveTab] = useState('novels'); // 'novels' or 'media'
    const [bookshelf, setBookshelf] = useState([]);
    const [mediaList, setMediaList] = useState([]);
    const [novelFilter, setNovelFilter] = useState('novel'); // 'novel' or 'comic'
    const [novelSearch, setNovelSearch] = useState('');
    
    // Novel Management state
    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editAuthor, setEditAuthor] = useState('');
    const [selectedNovel, setSelectedNovel] = useState(null);
    const [isNovelSelectionMode, setIsNovelSelectionMode] = useState(false);
    const [selectedNovelIds, setSelectedNovelIds] = useState(new Set());
    
    // Media tools state
    const [selectedMedia, setSelectedMedia] = useState(null);
    const player = useVideoPlayer(selectedMedia?.uri || null, (player) => {
        player.loop = false;
        player.play();
    });
    
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [filterBy, setFilterBy] = useState('all'); // 'all', 'image', 'video'
    const [filterTag, setFilterTag] = useState(null); // specific tag string
    const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest'

    // Storage Management state
    const [storageItems, setStorageItems] = useState([]);
    const [isScanningStorage, setIsScanningStorage] = useState(false);
    
    // Tag management state
    const [availableTags, setAvailableTags] = useState([]);
    const [showTagModal, setShowTagModal] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [tempSelectedTags, setTempSelectedTags] = useState(new Set());
    
    // Twitter Downloader state
    const [twitterUrl, setTwitterUrl] = useState('');
    const [isDownloadingTwitter, setIsDownloadingTwitter] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Selection logic state
    const flatListRef = React.useRef(null);
    const scrollYRef = React.useRef(0);
    const isSelectingRef = React.useRef(false);
    const lastSelectedIndexRef = React.useRef(-1);
    
    // Auto-scroll logic state
    const currentTouchXRef = React.useRef(0);
    const currentTouchYRef = React.useRef(0);
    const autoScrollTimerRef = React.useRef(null);

    // Sync isSelectionMode ref for PanResponder
    const isSelectionModeRef = React.useRef(isSelectionMode);
    useEffect(() => {
        isSelectionModeRef.current = isSelectionMode;
    }, [isSelectionMode]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
            loadMedia();
        });
        return unsubscribe;
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            const configureAudio = async () => {
                try {
                    await Audio.setAudioModeAsync({ staysActiveInBackground: false });
                } catch (e) {}
            };
            configureAudio();

            return () => {
                const restoreAudio = async () => {
                    try {
                        await Audio.setAudioModeAsync({ staysActiveInBackground: true });
                    } catch (e) {}
                };
                restoreAudio();
            };
        }, [])
    );

    const loadBookshelf = async () => {
        const list = await getBookshelf();
        setBookshelf(list.filter(n => n.folderId === 'vault'));
    };

    const loadMedia = async () => {
        try {
            const listStr = await AsyncStorage.getItem(VAULT_MEDIA_KEY);
            if (listStr) setMediaList(JSON.parse(listStr));
            
            const tagsStr = await AsyncStorage.getItem(VAULT_TAGS_KEY);
            if (tagsStr) setAvailableTags(JSON.parse(tagsStr));
        } catch (e) {}
    };

    const importMedia = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('需要權限', '請允許相簿存取權限以匯入檔案');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
            quality: 1,
        });

        if (!result.canceled) {
            setIsProcessing(true);
            try {
                const vaultDir = FileSystem.documentDirectory + 'vault_media/';
                const dirInfo = await FileSystem.getInfoAsync(vaultDir);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
                }

                const newMedia = [...mediaList];
                const assets = result.assets || [result];

                for (let i = 0; i < assets.length; i++) {
                    const asset = assets[i];
                    try {
                        let fileName = asset.fileName || asset.uri.split('/').pop() || 'media.jpg';
                        const isVideo = asset.type === 'video' || asset.mediaType === 'video' || fileName.toLowerCase().endsWith('.mp4') || fileName.toLowerCase().endsWith('.mov');
                        
                        // iOS AVPlayer requires a valid extension to play local files
                        if (isVideo && !fileName.includes('.')) {
                            fileName += '.mp4';
                        }

                        const uniqueId = Date.now().toString() + '_' + i + '_' + Math.random().toString(36).substring(7);
                        const newUri = vaultDir + uniqueId + '_' + fileName;
                        
                        await FileSystem.copyAsync({
                            from: asset.uri,
                            to: newUri
                        });
                        
                        let thumbnailUri = null;
                        if (isVideo) {
                            try {
                                const { uri: tUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
                                const tFileName = 'thumb_' + uniqueId + '.jpg';
                                const newTUri = vaultDir + tFileName;
                                await FileSystem.copyAsync({ from: tUri, to: newTUri });
                                thumbnailUri = newTUri;
                            } catch (e) {

                            }
                        }

                        newMedia.unshift({
                            id: uniqueId,
                            uri: newUri,
                            thumbnailUri,
                            type: isVideo ? 'video' : 'image',
                            createdAt: Date.now(),
                            tags: []
                        });
                    } catch (err) {

                    }
                }

                await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMedia));
                setMediaList(newMedia);
                Alert.alert('匯入完畢', `成功處理 ${assets.length} 個檔案！`);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    // --- Storage Management Logic ---

    const calculateFolderSize = async (uri) => {
        try {
            const info = await FileSystem.getInfoAsync(uri);
            if (!info.exists) return 0;
            if (!info.isDirectory) return info.size || 0;
            
            const children = await FileSystem.readDirectoryAsync(uri);
            let totalSize = 0;
            for (const child of children) {
                totalSize += await calculateFolderSize(uri + '/' + child);
            }
            return totalSize;
        } catch (e) {
            return 0;
        }
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const scanStorage = async () => {
        setIsScanningStorage(true);
        try {
            const items = [];
            const allNovels = await getBookshelf();
            
            const novelsDir = FileSystem.documentDirectory + 'novels/';
            const novelsDirInfo = await FileSystem.getInfoAsync(novelsDir);
            if (novelsDirInfo.exists) {
                const folders = await FileSystem.readDirectoryAsync(novelsDir);
                for (const folder of folders) {
                    const size = await calculateFolderSize(novelsDir + folder);
                    const matchedNovel = allNovels.find(n => n.id === folder);
                    items.push({
                        id: `novel_${folder}`,
                        type: 'novel',
                        rawId: folder,
                        path: novelsDir + folder,
                        name: matchedNovel ? matchedNovel.title : folder,
                        isOrphan: !matchedNovel,
                        size: size
                    });
                }
            }
            
            const mediaDir = FileSystem.documentDirectory + 'vault_media/';
            const mediaDirInfo = await FileSystem.getInfoAsync(mediaDir);
            if (mediaDirInfo.exists) {
                const files = await FileSystem.readDirectoryAsync(mediaDir);
                for (const file of files) {
                    const size = await calculateFolderSize(mediaDir + file);
                    const matchedMedia = mediaList.find(m => m.id === file);
                    items.push({
                        id: `media_${file}`,
                        type: 'media',
                        rawId: file,
                        path: mediaDir + file,
                        name: matchedMedia ? (matchedMedia.title || file) : file,
                        isOrphan: !matchedMedia,
                        size: size
                    });
                }
            }
            
            items.sort((a, b) => b.size - a.size);
            setStorageItems(items);
        } catch (e) {

        } finally {
            setIsScanningStorage(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'storage') {
            scanStorage();
        }
    }, [activeTab]);

    const handleDeleteStorageItem = (item) => {
        Alert.alert(
            '刪除檔案',
            `確定要刪除「${item.name}」嗎？\n這將會釋放 ${formatBytes(item.size)} 空間。`,
            [
                { text: '取消', style: 'cancel' },
                { text: '確定刪除', style: 'destructive', onPress: async () => {
                    try {
                        if (item.type === 'novel' && !item.isOrphan) {
                            await deleteNovel(item.rawId);
                            loadBookshelf();
                        } else if (item.type === 'media' && !item.isOrphan) {
                            const newMediaList = mediaList.filter(m => m.id !== item.rawId);
                            setMediaList(newMediaList);
                            await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMediaList));
                            await FileSystem.deleteAsync(item.path, { idempotent: true });
                        } else {
                            // Orphan files
                            await FileSystem.deleteAsync(item.path, { idempotent: true });
                        }
                        
                        // Rescan
                        scanStorage();
                    } catch (e) {
                        Alert.alert('刪除失敗', e.message);
                    }
                }}
            ]
        );
    };

    const displayedMedia = useMemo(() => {
        let list = [...mediaList];
        
        if (filterBy === 'image') {
            list = list.filter(m => m.type !== 'video');
        } else if (filterBy === 'video') {
            list = list.filter(m => m.type === 'video');
        }
        
        if (filterTag) {
            list = list.filter(m => m.tags && m.tags.includes(filterTag));
        }
        
        if (sortBy === 'newest') {
            list.sort((a, b) => b.createdAt - a.createdAt);
        } else {
            list.sort((a, b) => a.createdAt - b.createdAt);
        }
        
        return list;
    }, [mediaList, filterBy, filterTag, sortBy]);

    const displayedMediaRef = React.useRef(displayedMedia);
    useEffect(() => {
        displayedMediaRef.current = displayedMedia;
    }, [displayedMedia]);

    const toggleSelection = (id) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const processTouch = (x, y) => {
        const itemWidth = (screenWidth - 32) / 3;
        const headerHeight = 150; // Approximated height of top tab, import button, toolbar
        const relativeY = y - headerHeight + scrollYRef.current;
        
        if (relativeY < 0) return;

        const col = Math.floor((x - 16) / itemWidth);
        const row = Math.floor(relativeY / itemWidth);
        
        if (col < 0 || col > 2 || row < 0) return;

        const index = row * 3 + col;
        
        const displayed = displayedMediaRef.current;
        if (index >= 0 && index < displayed.length) {
            const item = displayed[index];
            if (lastSelectedIndexRef.current !== index) {
                lastSelectedIndexRef.current = index;
                setSelectedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.add(item.id);
                    return newSet;
                });
            }
        }
    };

    const startAutoScroll = () => {
        if (autoScrollTimerRef.current) return;
        autoScrollTimerRef.current = setInterval(() => {
            if (!isSelectingRef.current) {
                stopAutoScroll();
                return;
            }
            const y = currentTouchYRef.current;
            const x = currentTouchXRef.current;
            
            let didScroll = false;
            if (y < 180) {
                flatListRef.current?.scrollToOffset({ offset: Math.max(0, scrollYRef.current - 20), animated: false });
                didScroll = true;
            } else if (y > screenHeight - 150) {
                flatListRef.current?.scrollToOffset({ offset: scrollYRef.current + 20, animated: false });
                didScroll = true;
            }

            if (didScroll) {
                processTouch(x, y);
            } else {
                stopAutoScroll();
            }
        }, 50);
    };

    const stopAutoScroll = () => {
        if (autoScrollTimerRef.current) {
            clearInterval(autoScrollTimerRef.current);
            autoScrollTimerRef.current = null;
        }
    };

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false, 
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
                return isSelectionModeRef.current && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
            },
            onPanResponderGrant: (evt, gestureState) => {
                isSelectingRef.current = true;
                processTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
            },
            onPanResponderMove: (evt, gestureState) => {
                if (!isSelectingRef.current) return;
                
                currentTouchXRef.current = evt.nativeEvent.pageX;
                currentTouchYRef.current = evt.nativeEvent.pageY;
                
                processTouch(currentTouchXRef.current, currentTouchYRef.current);
                
                if (currentTouchYRef.current < 180 || currentTouchYRef.current > screenHeight - 150) {
                    startAutoScroll();
                } else {
                    stopAutoScroll();
                }
            },
            onPanResponderRelease: () => {
                isSelectingRef.current = false;
                lastSelectedIndexRef.current = -1;
                stopAutoScroll();
            },
            onPanResponderTerminate: () => {
                isSelectingRef.current = false;
                lastSelectedIndexRef.current = -1;
                stopAutoScroll();
            },
        })
    ).current;

    const confirmBatchDelete = () => {
        if (selectedItems.size === 0) return;
        Alert.alert(
            '批次刪除',
            `確定要永久刪除選取的 ${selectedItems.size} 個檔案嗎？\n(包含縮圖將一併清除乾淨)`,
            [
                { text: '取消', style: 'cancel' },
                { 
                    text: '刪除', 
                    style: 'destructive',
                    onPress: async () => {
                        setIsProcessing(true);
                        try {
                            let remaining = [...mediaList];
                            for (const id of selectedItems) {
                                const item = remaining.find(m => m.id === id);
                                if (item) {
                                    try {
                                        await FileSystem.deleteAsync(item.uri);
                                        if (item.thumbnailUri) await FileSystem.deleteAsync(item.thumbnailUri);
                                    } catch(e) {}
                                    remaining = remaining.filter(m => m.id !== id);
                                }
                            }
                            await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(remaining));
                            setMediaList(remaining);
                            setSelectedItems(new Set());
                            setIsSelectionMode(false);
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                }
            ]
        );
    };

    const openTagModal = () => {
        if (selectedItems.size === 0) return;
        setTempSelectedTags(new Set());
        setNewTagInput('');
        setShowTagModal(true);
    };

    const applyTagsToSelected = async () => {
        let newList = [...mediaList];
        const tagsToAdd = Array.from(tempSelectedTags);
        if (tagsToAdd.length === 0) return;
        
        for (let i = 0; i < newList.length; i++) {
            if (selectedItems.has(newList[i].id)) {
                let currentTags = newList[i].tags || [];
                let merged = Array.from(new Set([...currentTags, ...tagsToAdd]));
                newList[i].tags = merged;
            }
        }
        
        await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newList));
        setMediaList(newList);
        setShowTagModal(false);
        setIsSelectionMode(false);
        setSelectedItems(new Set());
        Alert.alert('標籤已套用', `成功為 ${selectedItems.size} 個檔案加入標籤！`);
    };

    const removeTagsFromSelected = async () => {
        let newList = [...mediaList];
        const tagsToRemove = Array.from(tempSelectedTags);
        if (tagsToRemove.length === 0) return;
        
        for (let i = 0; i < newList.length; i++) {
            if (selectedItems.has(newList[i].id)) {
                let currentTags = newList[i].tags || [];
                newList[i].tags = currentTags.filter(t => !tagsToRemove.includes(t));
            }
        }
        
        await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newList));
        setMediaList(newList);
        setShowTagModal(false);
        setIsSelectionMode(false);
        setSelectedItems(new Set());
        Alert.alert('標籤已移除', `成功從 ${selectedItems.size} 個檔案移除了選擇的標籤！`);
    };

    const handleCreateTag = async () => {
        const tag = newTagInput.trim();
        if (!tag) return;
        if (availableTags.includes(tag)) {
            setNewTagInput('');
            return;
        }
        const newTagsList = [...availableTags, tag];
        setAvailableTags(newTagsList);
        await AsyncStorage.setItem(VAULT_TAGS_KEY, JSON.stringify(newTagsList));
        setNewTagInput('');
        
        // Auto-select the newly created tag
        setTempSelectedTags(prev => new Set(prev).add(tag));
    };

    const deleteMedia = async (item) => {
        Alert.alert(
            '刪除檔案',
            '確定要永久刪除這個檔案嗎？',
            [
                { text: '取消', style: 'cancel' },
                { 
                    text: '刪除', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await FileSystem.deleteAsync(item.uri);
                            if (item.thumbnailUri) await FileSystem.deleteAsync(item.thumbnailUri);
                        } catch (e) {}
                        const newList = mediaList.filter(m => m.id !== item.id);
                        await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newList));
                        setMediaList(newList);
                        if (selectedMedia?.id === item.id) {
                            setSelectedMedia(null);
                        }
                    }
                }
            ]
        );
    };

    const getFilteredBookshelf = () => {
        let list = [...bookshelf];
        if (novelFilter === 'novel') {
            list = list.filter(item => item.type !== 'comic');
        } else if (novelFilter === 'comic') {
            list = list.filter(item => item.type === 'comic');
        }
        if (novelSearch.trim() !== '') {
            list = list.filter(item => item.title && item.title.toLowerCase().includes(novelSearch.toLowerCase()));
        }
        return list;
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

    const toggleNovelSelection = (id) => {
        const newSet = new Set(selectedNovelIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedNovelIds(newSet);
    };

    const downloadTwitterVideo = () => {
        if (!twitterUrl.trim()) return;
        setIsDownloadingTwitter(true);
    };

    const handleWebViewMessage = async (event) => {
        const message = event.nativeEvent.data;
        if (message === 'TIMEOUT') {
            Alert.alert('下載失敗', '無法獲取連結（超時）');
            setIsDownloadingTwitter(false);
            setTwitterUrl('');
            return;
        }
        
        if (message.startsWith('http')) {
            const fileUrl = message;
            const isImage = fileUrl.toLowerCase().includes('.jpg') || fileUrl.toLowerCase().includes('.jpeg') || fileUrl.toLowerCase().includes('.png');
            const ext = isImage ? '.jpg' : '.mp4';
            const type = isImage ? 'image' : 'video';
            
            try {
                const vaultDir = FileSystem.documentDirectory + 'vault_media/';
                const dirInfo = await FileSystem.getInfoAsync(vaultDir);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true });
                }

                const uniqueId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
                const fileName = uniqueId + '_twitter' + ext;
                const destUri = vaultDir + fileName;

                const downloadResult = await FileSystem.downloadAsync(fileUrl, destUri);
                if (downloadResult.status !== 200) throw new Error('下載失敗');

                let thumbnailUri = null;
                if (type === 'video') {
                    try {
                        const { uri: tUri } = await VideoThumbnails.getThumbnailAsync(destUri, { time: 1000 });
                        const tFileName = 'thumb_' + uniqueId + '.jpg';
                        const newTUri = vaultDir + tFileName;
                        await FileSystem.copyAsync({ from: tUri, to: newTUri });
                        thumbnailUri = newTUri;
                    } catch (e) {}
                }

                const newItem = {
                    id: uniqueId,
                    uri: destUri,
                    thumbnailUri,
                    type: type,
                    createdAt: Date.now(),
                    tags: ['twitter'],
                    title: 'Twitter 檔案'
                };

                const newMedia = [newItem, ...mediaList];
                await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMedia));
                setMediaList(newMedia);
                Alert.alert('下載成功！', '檔案已儲存至金庫。');
            } catch (e) {
                Alert.alert('下載失敗', e.message);
            } finally {
                setIsDownloadingTwitter(false);
                setTwitterUrl('');
            }
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'novels' && { backgroundColor: colors.primary }]}
                    onPress={() => setActiveTab('novels')}
                >
                    <Text style={{ color: activeTab === 'novels' ? '#fff' : colors.text }}>隱藏小說</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'media' && { backgroundColor: colors.primary }]}
                    onPress={() => setActiveTab('media')}
                >
                    <Text style={{ color: activeTab === 'media' ? '#fff' : colors.text }}>私密相簿</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'storage' && { backgroundColor: colors.primary }]}
                    onPress={() => setActiveTab('storage')}
                >
                    <Text style={{ color: activeTab === 'storage' ? '#fff' : colors.text }}>空間管理</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'storage' ? (
                <View style={{ flex: 1 }}>
                    {isScanningStorage ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={{ color: colors.textSecondary, marginTop: 16 }}>正在掃描儲存空間...</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={storageItems}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 16 }}
                            ListHeaderComponent={
                                <View style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                                        總共 {storageItems.length} 個項目
                                    </Text>
                                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: 'bold' }}>
                                        合計: {formatBytes(storageItems.reduce((acc, curr) => acc + curr.size, 0))}
                                    </Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <View style={[styles.storageItem, { backgroundColor: colors.surface, borderLeftColor: item.isOrphan ? (colors.danger || '#ff4444') : colors.primary }]}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                                            {item.type === 'novel' ? '📚 書籍/文章' : '🖼️ 媒體檔案'} {item.isOrphan && ' (未知殘留)'}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
                                            {formatBytes(item.size)}
                                        </Text>
                                        <TouchableOpacity 
                                            style={[styles.storageDeleteBtn, { backgroundColor: 'rgba(255, 68, 68, 0.1)' }]}
                                            onPress={() => handleDeleteStorageItem(item)}
                                        >
                                            <Feather name="trash-2" size={16} color="#ff4444" />
                                            <Text style={{ color: '#ff4444', fontSize: 12, marginLeft: 4, fontWeight: 'bold' }}>刪除</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                            ListEmptyComponent={
                                <View style={{ padding: 32, alignItems: 'center' }}>
                                    <Text style={{ color: colors.textSecondary }}>目前沒有佔用空間的檔案。</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            ) : activeTab === 'novels' ? (
                <View style={{ flex: 1 }}>
                    <FlatList 
                        data={getFilteredBookshelf()}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingBottom: isNovelSelectionMode ? 100 : 20 }}
                        ListHeaderComponent={
                            <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 16 }}>
                                {/* Segmented Control for Novels/Comics */}
                                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, padding: 4, marginBottom: 16 }}>
                                    <TouchableOpacity 
                                        style={{ flex: 1, padding: 8, borderRadius: 6, backgroundColor: novelFilter === 'novel' ? colors.primary : 'transparent', alignItems: 'center' }}
                                        onPress={() => setNovelFilter('novel')}
                                    >
                                        <Text style={{ color: novelFilter === 'novel' ? '#fff' : colors.text, fontWeight: 'bold' }}>小說</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={{ flex: 1, padding: 8, borderRadius: 6, backgroundColor: novelFilter === 'comic' ? colors.primary : 'transparent', alignItems: 'center' }}
                                        onPress={() => setNovelFilter('comic')}
                                    >
                                        <Text style={{ color: novelFilter === 'comic' ? '#fff' : colors.text, fontWeight: 'bold' }}>漫畫</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>
                                        {novelFilter === 'comic' ? '漫畫庫' : '小說庫'}
                                    </Text>
                                    <TouchableOpacity onPress={() => setIsNovelSelectionMode(!isNovelSelectionMode)}>
                                        <Text style={{ color: isNovelSelectionMode ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>
                                            {isNovelSelectionMode ? '取消選取' : '批次管理'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Search UI */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, alignItems: 'center', paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border }}>
                                        <Feather name="search" size={16} color={colors.textSecondary} />
                                        <TextInput 
                                            style={{ flex: 1, marginLeft: 8, color: colors.text }}
                                            placeholder="搜尋標題..."
                                            placeholderTextColor={colors.textSecondary}
                                            value={novelSearch}
                                            onChangeText={setNovelSearch}
                                        />
                                        {novelSearch !== '' && (
                                            <TouchableOpacity onPress={() => setNovelSearch('')}>
                                                <Feather name="x-circle" size={16} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </View>
                        }
                        renderItem={({ item }) => (
                            <NovelListItem 
                                item={item}
                                onPress={() => {
                                    if (isNovelSelectionMode) {
                                        toggleNovelSelection(item.id);
                                    } else {
                                        if (item.type === 'comic') {
                                            navigation.navigate('ComicReader', { novelId: item.id, title: item.title, isVault: true });
                                        } else {
                                            navigation.navigate('Reader', { novelId: item.id, title: item.title, isVault: true });
                                        }
                                    }
                                }}
                                onLongPress={() => {
                                    if (!isNovelSelectionMode) {
                                        setSelectedNovel(item);
                                        setEditTitle(item.title || '');
                                        setEditAuthor(item.author || '');
                                        setIsOptionsModalVisible(true);
                                    } else {
                                        toggleNovelSelection(item.id);
                                    }
                                }}
                                onAuthorPress={(author) => {
                                    if (item.type === 'comic') {
                                        navigation.navigate('JMComicFeed', { initialQuery: author });
                                    }
                                }}
                                colors={colors}
                                isDark={isDark}
                                customActions={isNovelSelectionMode ? (
                                    <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                                        <Feather name={selectedNovelIds.has(item.id) ? "check-square" : "square"} size={24} color={selectedNovelIds.has(item.id) ? colors.primary : colors.textSecondary} />
                                    </View>
                                ) : null}
                            />
                        )}
                        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>金庫內目前沒有隱藏的{novelFilter === 'comic' ? '漫畫' : '小說'}。</Text>}
                    />

                    {isNovelSelectionMode && (
                        <BlurView intensity={isDark ? 80 : 50} tint={isDark ? 'dark' : 'light'} style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: 20, paddingBottom: 40,
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: colors.border,
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <Text style={{ color: colors.text, fontWeight: 'bold' }}>已選取 {selectedNovelIds.size} 本</Text>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <TouchableOpacity 
                                    style={{ padding: 15, backgroundColor: '#FF3B30', borderRadius: 8 }}
                                    disabled={selectedNovelIds.size === 0}
                                    onPress={() => {
                                        if (selectedNovelIds.size === 0) return;
                                        Alert.alert('批次刪除', `確定要刪除選取的 ${selectedNovelIds.size} 本書籍嗎？`, [
                                            { text: '取消', style: 'cancel' },
                                            { text: '刪除', style: 'destructive', onPress: async () => {
                                                for (const id of selectedNovelIds) {
                                                    await deleteNovel(id);
                                                }
                                                setIsNovelSelectionMode(false);
                                                setSelectedNovelIds(new Set());
                                                loadBookshelf();
                                            }}
                                        ]);
                                    }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>批次刪除</Text>
                                </TouchableOpacity>
                            </View>
                        </BlurView>
                    )}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
                        <TouchableOpacity style={[styles.importBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.primary, marginBottom: 0 }]} onPress={importMedia}>
                            <Feather name="plus-circle" size={24} color={colors.primary} style={{ marginRight: 8 }} />
                            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>從相簿匯入</Text>
                        </TouchableOpacity>
                    </View>
                    
                    {/* Twitter Video Downloader */}
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                                <TextInput 
                                    style={{ flex: 1, padding: 12, color: colors.text }}
                                    placeholder="貼上 Twitter (X) 影片連結..."
                                    placeholderTextColor={colors.textSecondary}
                                    value={twitterUrl}
                                    onChangeText={setTwitterUrl}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity 
                                    style={{ backgroundColor: colors.primary, padding: 12, justifyContent: 'center', alignItems: 'center' }}
                                    onPress={downloadTwitterVideo}
                                    disabled={isDownloadingTwitter || !twitterUrl}
                                >
                                    {isDownloadingTwitter ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Feather name="download" size={20} color="#fff" />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                    {isDownloadingTwitter && twitterUrl ? (
                        <View style={{ height: 0, width: 0, opacity: 0 }}>
                            <WebView 
                                source={{ uri: 'https://ssstwitter.com/' }}
                                injectedJavaScript={`
                                  (function() {
                                    var interval = setInterval(function() {
                                      var input = document.getElementById('main_page_text');
                                      var submit = document.getElementById('submit');
                                      if (input && submit && !input.value) {
                                        input.value = "${twitterUrl}";
                                        submit.click();
                                      }
                                      
                                      var downBtn = document.querySelector('.result_overlay a.download_link');
                                      if (downBtn && downBtn.href) {
                                        clearInterval(interval);
                                        window.ReactNativeWebView.postMessage(downBtn.href);
                                      }
                                    }, 1000);
                                    setTimeout(function() {
                                        clearInterval(interval);
                                        window.ReactNativeWebView.postMessage('TIMEOUT');
                                    }, 15000);
                                  })();
                                `}
                                onMessage={handleWebViewMessage}
                                javaScriptEnabled={true}
                            />
                        </View>
                    ) : null}
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center', paddingHorizontal: 16 }}>
                        {isSelectionMode ? (
                            <>
                                <TouchableOpacity onPress={() => { setIsSelectionMode(false); setSelectedItems(new Set()); }} style={{ padding: 8 }}>
                                    <Text style={{ color: colors.text }}>取消</Text>
                                </TouchableOpacity>
                                <Text style={{ color: colors.text, fontWeight: 'bold' }}>已選取 {selectedItems.size}</Text>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <TouchableOpacity onPress={openTagModal} style={{ padding: 8 }}>
                                        <Text style={{ color: colors.primary, fontWeight: 'bold' }}>加標籤</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={confirmBatchDelete} style={{ padding: 8 }}>
                                        <Text style={{ color: colors.danger, fontWeight: 'bold' }}>刪除</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', gap: 24, padding: 8 }}>
                                    <TouchableOpacity onPress={() => {
                                        let filterOptions = [
                                            { text: '全部', onPress: () => { setFilterBy('all'); setFilterTag(null); } },
                                            { text: '僅照片', onPress: () => { setFilterBy('image'); setFilterTag(null); } },
                                            { text: '僅影片', onPress: () => { setFilterBy('video'); setFilterTag(null); } },
                                        ];
                                        if (availableTags.length > 0) {
                                            availableTags.forEach(tag => {
                                                filterOptions.push({ text: `標籤: ${tag}`, onPress: () => setFilterTag(tag) });
                                            });
                                        }
                                        filterOptions.push({ text: '取消', style: 'cancel' });
                                        Alert.alert('篩選', '選擇要顯示的類型或標籤', filterOptions);
                                    }}>
                                        <Feather name="filter" size={20} color={(filterBy !== 'all' || filterTag) ? colors.primary : colors.text} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => {
                                        Alert.alert('排序', '選擇排序方式', [
                                            { text: '最新加入', onPress: () => setSortBy('newest') },
                                            { text: '最舊加入', onPress: () => setSortBy('oldest') },
                                            { text: '取消', style: 'cancel' }
                                        ]);
                                    }}>
                                        <Feather name="list" size={20} color={sortBy !== 'newest' ? colors.primary : colors.text} />
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity onPress={() => setIsSelectionMode(true)} style={{ padding: 8 }}>
                                    <Text style={{ color: colors.primary, fontWeight: 'bold' }}>選取</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
                        <FlatList 
                            ref={flatListRef}
                            onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                            scrollEventThrottle={16}
                            data={displayedMedia}
                            keyExtractor={item => item.id}
                            numColumns={3}
                            removeClippedSubviews={true}
                            initialNumToRender={12}
                            maxToRenderPerBatch={6}
                            windowSize={5}
                            getItemLayout={(data, index) => {
                                const itemWidth = (screenWidth - 32) / 3;
                                return { length: itemWidth, offset: itemWidth * Math.floor(index / 3), index };
                            }}
                            renderItem={({ item }) => (
                            <TouchableOpacity 
                                style={[styles.mediaItem, isSelectionMode && selectedItems.has(item.id) && { opacity: 0.7 }]} 
                                onPress={() => {
                                    if (isSelectionMode) toggleSelection(item.id);
                                    else setSelectedMedia(item);
                                }}
                                onLongPress={() => {
                                    if (!isSelectionMode) {
                                        setIsSelectionMode(true);
                                        toggleSelection(item.id);
                                    }
                                }}
                            >
                                {item.type === 'video' ? (
                                    <View style={[styles.mediaImage, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                                        {item.thumbnailUri ? (
                                            <Image source={{ uri: item.thumbnailUri }} style={{ width: '100%', height: '100%', position: 'absolute' }} />
                                        ) : null}
                                        <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8, zIndex: 1 }}>
                                            <Feather name="play-circle" size={28} color="#fff" />
                                        </View>
                                    </View>
                                ) : (
                                    <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                                )}
                                
                                {item.tags && item.tags.length > 0 && (
                                    <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', gap: 2, flexWrap: 'wrap', maxWidth: '80%' }}>
                                        {item.tags.map((t, idx) => (
                                            <View key={idx} style={{ backgroundColor: colors.primary, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                                                <Text style={{ color: '#fff', fontSize: 8 }}>{t}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                
                                {isSelectionMode && (
                                    <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: selectedItems.has(item.id) ? colors.primary : 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 2, borderWidth: 1, borderColor: '#fff' }}>
                                        <Feather name="check" size={16} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>金庫內目前沒有隱藏的相片或影片。\n點擊上方按鈕匯入。</Text>}
                    />
                    </View>
                </View>
            )}
            
            {/* Fullscreen Media Viewer */}
            <Modal visible={!!selectedMedia} transparent={false} animationType="fade">
                <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#000' }}>
                    <View style={styles.viewerHeader}>
                        <TouchableOpacity onPress={() => setSelectedMedia(null)} style={{ padding: 16 }}>
                            <Feather name="x" size={28} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteMedia(selectedMedia)} style={{ padding: 16 }}>
                            <Feather name="trash-2" size={24} color="#ff4444" />
                        </TouchableOpacity>
                    </View>
                    
                    {selectedMedia?.type === 'video' ? (
                        <VideoView
                            style={styles.fullMedia}
                            player={player}
                            allowsFullscreen
                            allowsPictureInPicture
                        />
                    ) : (
                        selectedMedia && <Image source={{ uri: selectedMedia.uri }} style={styles.fullMedia} resizeMode="contain" />
                    )}
                </View>
            </Modal>

            {/* Tag Management Modal */}
            <Modal visible={showTagModal} transparent={true} animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={[styles.modalContent, { backgroundColor: isDark ? 'rgba(36,39,43,0.85)' : 'rgba(255,255,255,0.85)' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>設定標籤</Text>
                            <TouchableOpacity onPress={() => setShowTagModal(false)}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={{ padding: 16 }}>
                            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>選擇現有標籤：</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {availableTags.map(tag => (
                                    <TouchableOpacity 
                                        key={tag}
                                        style={{ 
                                            backgroundColor: tempSelectedTags.has(tag) ? colors.primary : colors.background, 
                                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                                            borderWidth: 1, borderColor: tempSelectedTags.has(tag) ? colors.primary : colors.border
                                        }}
                                        onPress={() => {
                                            setTempSelectedTags(prev => {
                                                const newSet = new Set(prev);
                                                if (newSet.has(tag)) newSet.delete(tag);
                                                else newSet.add(tag);
                                                return newSet;
                                            });
                                        }}
                                    >
                                        <Text style={{ color: tempSelectedTags.has(tag) ? '#fff' : colors.text }}>{tag}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            
                            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>或建立新標籤：</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                                <TextInput
                                    style={{ flex: 1, backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border }}
                                    placeholder="輸入新標籤名稱..."
                                    placeholderTextColor={colors.textSecondary}
                                    value={newTagInput}
                                    onChangeText={setNewTagInput}
                                    onSubmitEditing={handleCreateTag}
                                />
                                <TouchableOpacity 
                                    style={{ backgroundColor: colors.primary, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 12 }}
                                    onPress={handleCreateTag}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>新增</Text>
                                </TouchableOpacity>
                            </View>
                            
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity 
                                    style={{ flex: 1, backgroundColor: colors.danger, padding: 16, borderRadius: 16, alignItems: 'center' }}
                                    onPress={removeTagsFromSelected}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>移除勾選標籤</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    style={{ flex: 1, backgroundColor: colors.primary, padding: 16, borderRadius: 16, alignItems: 'center' }}
                                    onPress={applyTagsToSelected}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>套用勾選標籤</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </BlurView>
                </KeyboardAvoidingView>
            </Modal>
            
            {/* Novel Options Modal */}
            <Modal visible={isOptionsModalVisible} transparent={true} animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsOptionsModalVisible(false)}>
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

                        <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={handleEditNovel}
                            >
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>儲存變更</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1, borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={() => {
                                    Alert.alert('移出金庫', '確定要解除隱藏嗎？', [
                                        { text: '取消', style: 'cancel' },
                                        { text: '確定', onPress: async () => {
                                            await updateNovelMetadata(selectedNovel.id, { folderId: null, isHidden: false });
                                            setIsOptionsModalVisible(false);
                                            loadBookshelf();
                                        }}
                                    ]);
                                }}
                            >
                                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: 'bold' }}>解除隱藏</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[{ flex: 1, backgroundColor: colors.danger || '#ff4444', borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' }]} 
                                onPress={() => {
                                    Alert.alert('刪除書籍', '確定要永久刪除這本書嗎？', [
                                        { text: '取消', style: 'cancel' },
                                        { text: '刪除', style: 'destructive', onPress: async () => {
                                            await deleteNovel(selectedNovel.id);
                                            setIsOptionsModalVisible(false);
                                            loadBookshelf();
                                        }}
                                    ]);
                                }}
                            >
                                <Text style={{ color: "white", fontSize: 16, fontWeight: 'bold' }}>刪除</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {isProcessing && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    tabContainer: { flexDirection: 'row', marginBottom: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#ccc' },
    tab: { flex: 1, padding: 12, alignItems: 'center' },
    bookItem: { flexDirection: 'row', padding: 12, borderRadius: 8, marginBottom: 12, elevation: 2 },
    cover: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    coverPlaceholder: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    bookInfo: { flex: 1, justifyContent: 'center' },
    bookTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    bookSubtitle: { fontSize: 12 },
    actionBtn: { padding: 8, justifyContent: 'center' },
    emptyText: { textAlign: 'center', marginTop: 40 },
    importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
    mediaItem: { flex: 1, aspectRatio: 1, margin: 4, borderRadius: 8, overflow: 'hidden' },
    mediaImage: { width: '100%', height: '100%' },
    viewerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    viewerHeader: { position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
    fullMedia: { width: '100%', height: '100%' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '80%', overflow: 'hidden' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    modalTitle: { fontSize: 20, fontWeight: '700' },
    storageItem: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        alignItems: 'center',
        borderLeftWidth: 4,
    },
    storageDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
    }
});
