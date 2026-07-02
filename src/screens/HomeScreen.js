import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { getBookshelf, deleteNovel } from '../utils/storage';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useDownload } from '../context/DownloadContext';

export default function HomeScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    const { startDownload, isDownloading, progressText } = useDownload();
    
    const [url, setUrl] = useState('');
    const [bookshelf, setBookshelf] = useState([]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadBookshelf();
        });
        return unsubscribe;
    }, [navigation]);

    const loadBookshelf = async () => {
        const list = await getBookshelf();
        setBookshelf(list);
    };

    const confirmDelete = (novel) => {
        Alert.alert(
            '刪除書籍',
            `確定要從書櫃中刪除《${novel.title}》嗎？（已下載的章節也會一併刪除）`,
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

    const handleDownload = () => {
        if (!url || isDownloading) return;
        
        startDownload(url, (novelInfo) => {
            // Callback fired when at least 5 chapters are downloaded (or all if < 5)
            setUrl('');
            loadBookshelf();
            // Automatically navigate to reader screen
            navigation.navigate('Reader', { novelId: novelInfo.id, title: novelInfo.title });
        });
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.inputContainer}>
                <TextInput 
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="貼上 czbooks.net 網址"
                    placeholderTextColor={colors.textSecondary}
                    value={url}
                    onChangeText={setUrl}
                    editable={!isDownloading}
                />
                <Button title="開始下載" onPress={handleDownload} disabled={isDownloading || !url} color={colors.primary} />
            </View>
            
            {isDownloading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={{ color: colors.text, marginTop: 8 }}>{progressText}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>前 5 章下載完畢後會自動進入閱讀</Text>
                </View>
            )}

            <FlatList 
                data={bookshelf}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={[styles.bookItem, { backgroundColor: colors.surface, shadowColor: isDark ? '#000' : '#ccc' }]}
                        onPress={() => navigation.navigate('Reader', { novelId: item.id, title: item.title })}
                    >
                        {item.cover ? <Image source={{uri: item.cover}} style={styles.cover} /> : <View style={[styles.coverPlaceholder, { backgroundColor: colors.border }]} />}
                        <View style={styles.bookInfo}>
                            <Text style={[styles.bookTitle, { color: colors.text }]}>{item.title}</Text>
                            <Text style={[styles.bookSubtitle, { color: colors.textSecondary }]}>共 {item.chapterCount} 章</Text>
                            <Text style={[styles.bookSubtitle, { color: colors.textSecondary }]}>上次閱讀: 第 {item.progressIndex + 1} 章</Text>
                        </View>
                        <TouchableOpacity 
                            style={styles.deleteBtn}
                            onPress={() => confirmDelete(item)}
                        >
                            <Feather name="trash-2" size={20} color={colors.danger} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>書櫃目前是空的，快去下載小說吧！</Text>}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    inputContainer: { flexDirection: 'row', marginBottom: 16 },
    input: { flex: 1, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, marginRight: 8 },
    loadingContainer: { alignItems: 'center', marginBottom: 16 },
    bookItem: { flexDirection: 'row', padding: 12, borderRadius: 8, marginBottom: 12, elevation: 2 },
    cover: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    coverPlaceholder: { width: 60, height: 80, borderRadius: 4, marginRight: 12 },
    bookInfo: { flex: 1, justifyContent: 'center' },
    bookTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    bookSubtitle: { fontSize: 12 },
    deleteBtn: { padding: 8, justifyContent: 'center' },
    emptyText: { textAlign: 'center', marginTop: 40 }
});
