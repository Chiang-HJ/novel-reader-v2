import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { getBookshelf, deleteNovel, moveNovelToFolder } from '../utils/storage';
import { deleteFolder } from '../utils/folderStorage';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function FolderScreen({ route, navigation }) {
    const { folderId, folderName } = route.params;
    const { colors, isDark } = useTheme();
    
    const [bookshelf, setBookshelf] = useState([]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
        });
        
        // Add delete folder button to header
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity onPress={confirmDeleteFolder} style={{ padding: 8 }}>
                    <Feather name="trash-2" size={20} color={colors.danger} />
                </TouchableOpacity>
            )
        });
        
        return unsubscribe;
    }, [navigation]);

    const loadBookshelf = async () => {
        const list = await getBookshelf();
        setBookshelf(list.filter(n => n.folderId === folderId));
    };

    const confirmDeleteFolder = () => {
        Alert.alert(
            '刪除資料夾',
            `確定要刪除「${folderName}」嗎？\n資料夾內的小說將會被移回未分類區，不會被刪除。`,
            [
                { text: '取消', style: 'cancel' },
                { 
                    text: '刪除', 
                    style: 'destructive',
                    onPress: async () => {
                        // 1. Move all novels back to root
                        const list = await getBookshelf();
                        const novelsInFolder = list.filter(n => n.folderId === folderId);
                        for (const n of novelsInFolder) {
                            await moveNovelToFolder(n.id, null);
                        }
                        // 2. Delete folder
                        await deleteFolder(folderId);
                        navigation.goBack();
                    }
                }
            ]
        );
    };

    const confirmDeleteNovel = (novel) => {
        Alert.alert(
            '刪除書籍',
            `確定要刪除《${novel.title}》嗎？`,
            [
                { text: '取消', style: 'cancel' },
                { 
                    text: '刪除', 
                    style: 'destructive',
                    onPress: async () => {
                        await deleteNovel(novel.id);
                        loadBookshelf();
                    }
                }
            ]
        );
    };
    
    const confirmRemoveFromFolder = (novel) => {
        Alert.alert(
            '移出資料夾',
            `將《${novel.title}》移回未分類區？`,
            [
                { text: '取消', style: 'cancel' },
                { 
                    text: '確定',
                    onPress: async () => {
                        await moveNovelToFolder(novel.id, null);
                        loadBookshelf();
                    }
                }
            ]
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <FlatList 
                data={bookshelf}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={[styles.bookItem, { backgroundColor: colors.surface, shadowColor: isDark ? '#000' : '#ccc', borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}
                        onPress={() => navigation.navigate('Reader', { novelId: item.id, title: item.title })}
                    >
                        {item.cover ? <Image source={{uri: item.cover}} style={styles.cover} /> : <View style={[styles.coverPlaceholder, { backgroundColor: colors.border }]} />}
                        <View style={styles.bookInfo}>
                            <Text style={[styles.bookTitle, { color: colors.text }]}>{item.title}</Text>
                            <Text style={[styles.bookSubtitle, { color: colors.textSecondary }]}>共 {item.chapterCount} 章</Text>
                            <Text style={[styles.bookSubtitle, { color: colors.textSecondary }]}>上次閱讀: 第 {item.progressIndex + 1} 章</Text>
                        </View>
                        <View style={styles.actionButtons}>
                            <TouchableOpacity 
                                style={[styles.actionBtn, { marginRight: 8 }]}
                                onPress={() => confirmRemoveFromFolder(item)}
                            >
                                <Feather name="folder-minus" size={20} color={colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={styles.actionBtn}
                                onPress={() => confirmDeleteNovel(item)}
                            >
                                <Feather name="trash-2" size={20} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>這個資料夾目前是空的。</Text>}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    bookItem: { flexDirection: 'row', padding: 12, borderRadius: 8, marginBottom: 12, elevation: 2 },
    cover: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    coverPlaceholder: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    bookInfo: { flex: 1, justifyContent: 'center' },
    bookTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    bookSubtitle: { fontSize: 12 },
    actionButtons: { flexDirection: 'row', alignItems: 'center' },
    actionBtn: { padding: 8, justifyContent: 'center' },
    emptyText: { textAlign: 'center', marginTop: 40 }
});
