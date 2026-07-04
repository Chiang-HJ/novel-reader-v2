import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

export default function SearchBar({ searchInput, setSearchInput, onSearch, onImportText, onImportFile, colors }) {
    const handlePaste = async () => {
        const text = await Clipboard.getStringAsync();
        if (text) {
            setSearchInput(text);
        }
    };

    const handleClear = () => {
        setSearchInput('');
    };

    return (
        <View style={styles.container}>
            <View style={styles.inputContainer}>
                <Feather name="link" size={20} color={colors.textSecondary} style={styles.icon} />
                <TextInput 
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                    placeholder="搜尋書名、作者或貼上網址下載..."
                    placeholderTextColor={colors.textSecondary}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    onSubmitEditing={onSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TouchableOpacity 
                    style={[styles.searchBtn, { backgroundColor: colors.primary }]} 
                    onPress={onSearch}
                    disabled={!searchInput.trim()}
                >
                    <Feather name="download" size={20} color="white" />
                </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={handleClear}>
                    <Feather name="x-circle" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>清除</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={handlePaste}>
                    <Feather name="clipboard" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>貼上網址</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={onImportText}>
                    <Feather name="edit-3" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>貼上文字</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={onImportFile}>
                    <Feather name="file-plus" size={16} color="white" style={{ marginRight: 6 }} />
                    <Text style={{ color: "white", fontSize: 14, fontWeight: '600' }}>匯入檔案</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: 20, paddingHorizontal: 20 },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 2,
    },
    icon: { paddingLeft: 12, paddingRight: 8, position: 'absolute', zIndex: 1 },
    input: { 
        flex: 1, 
        height: 50,
        paddingLeft: 40,
        paddingRight: 12,
        fontSize: 16,
    },
    searchBtn: { 
        height: 50, 
        paddingHorizontal: 20, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 10,
        gap: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    }
});
