import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image, ScrollView, Modal, PanResponder, Dimensions, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { getBookshelf, deleteNovel, moveNovelToFolder } from '../utils/storage';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { BlurView } from 'expo-blur';
import NovelListItem from '../components/home/NovelListItem';

const VAULT_MEDIA_KEY = '@vault_media';
const VAULT_TAGS_KEY = '@vault_tags';

export default function VaultScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const [activeTab, setActiveTab] = useState('novels'); // 'novels' or 'media'
    const [bookshelf, setBookshelf] = useState([]);
    const [mediaList, setMediaList] = useState([]);
    
    // Media tools state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [filterBy, setFilterBy] = useState('all'); // 'all', 'image', 'video'
    const [filterTag, setFilterTag] = useState(null); // specific tag string
    const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest'
    
    // Tag management state
    const [availableTags, setAvailableTags] = useState([]);
    const [showTagModal, setShowTagModal] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [tempSelectedTags, setTempSelectedTags] = useState(new Set());

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

    // Viewer state
    const [selectedMedia, setSelectedMedia] = useState(null);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
            loadMedia();
        });
        return unsubscribe;
    }, [navigation]);

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
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            allowsMultipleSelection: true,
            quality: 1,
        });

        if (!result.canceled) {
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
                            console.log('Thumbnail generation failed', e);
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
                    console.error('Import error:', err);
                }
            }

            await AsyncStorage.setItem(VAULT_MEDIA_KEY, JSON.stringify(newMedia));
            setMediaList(newMedia);
            Alert.alert('匯入完畢', `成功處理 ${assets.length} 個檔案！`);
        }
    };

    const getDisplayedMedia = () => {
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
    };

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
        
        const displayed = getDisplayedMedia();
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
            </View>

            {activeTab === 'novels' ? (
                <FlatList 
                    data={bookshelf}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <NovelListItem 
                            item={item}
                            onPress={() => navigation.navigate('Reader', { novelId: item.id, title: item.title })}
                            colors={colors}
                            isDark={isDark}
                            customActions={
                                <TouchableOpacity 
                                    style={{ padding: 8, justifyContent: 'center' }}
                                    onPress={() => {
                                        Alert.alert('移出金庫', '確定要解除隱藏嗎？', [
                                            { text: '取消', style: 'cancel' },
                                            { text: '確定', onPress: async () => {
                                                await moveNovelToFolder(item.id, null);
                                                loadBookshelf();
                                            }}
                                        ]);
                                    }}
                                >
                                    <Feather name="eye" size={20} color={colors.primary} />
                                </TouchableOpacity>
                            }
                        />
                    )}
                    ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>金庫內目前沒有隱藏的小說。</Text>}
                />
            ) : (
                <View style={{ flex: 1 }}>
                    <TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.surface, borderColor: colors.primary }]} onPress={importMedia}>
                        <Feather name="plus-circle" size={24} color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.primary, fontWeight: 'bold' }}>從相簿匯入並隱藏</Text>
                    </TouchableOpacity>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
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
                            data={getDisplayedMedia()}
                        keyExtractor={item => item.id}
                        numColumns={3}
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
                <View style={[styles.viewerContainer, { backgroundColor: '#000' }]}>
                    <View style={styles.viewerHeader}>
                        <TouchableOpacity onPress={() => setSelectedMedia(null)} style={{ padding: 16 }}>
                            <Feather name="x" size={28} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteMedia(selectedMedia)} style={{ padding: 16 }}>
                            <Feather name="trash-2" size={24} color="#ff4444" />
                        </TouchableOpacity>
                    </View>
                    
                    {selectedMedia?.type === 'video' ? (
                        <Video
                            style={styles.fullMedia}
                            source={{ uri: selectedMedia.uri }}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping={false}
                            shouldPlay
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
});
