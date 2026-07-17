import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { getDictionaries, saveTextFilters, savePronunciationDict } from '../utils/dictionaryStorage';

export default function DictionaryManagerScreen({ navigation }) {
    const { colors, isDark } = useTheme();
    
    // 0: 文字過濾, 1: 語音校正
    const [activeTab, setActiveTab] = useState(0);
    
    const [textFilters, setTextFilters] = useState([]);
    const [pronunciationDict, setPronunciationDict] = useState([]);
    
    const [showModal, setShowModal] = useState(false);
    const [editTarget, setEditTarget] = useState('');
    const [editReplacement, setEditReplacement] = useState('');
    const [editIsRegex, setEditIsRegex] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const { textFilters, pronunciationDict } = await getDictionaries();
        setTextFilters(textFilters);
        setPronunciationDict(pronunciationDict);
    };

    const handleDelete = (id, type) => {
        if (type === 'text') {
            const newFilters = textFilters.filter(item => item.id !== id);
            setTextFilters(newFilters);
            saveTextFilters(newFilters);
        } else {
            const newDict = pronunciationDict.filter(item => item.id !== id);
            setPronunciationDict(newDict);
            savePronunciationDict(newDict);
        }
    };

    const handleSave = () => {
        if (!editTarget.trim()) {
            Alert.alert('錯誤', '請輸入要尋找的目標文字');
            return;
        }

        const newItem = {
            id: Date.now().toString(),
            target: editTarget.trim(),
            replacement: editReplacement.trim(),
            isRegex: editIsRegex
        };

        if (activeTab === 0) {
            const newFilters = [newItem, ...textFilters];
            setTextFilters(newFilters);
            saveTextFilters(newFilters);
        } else {
            const newDict = [newItem, ...pronunciationDict];
            setPronunciationDict(newDict);
            savePronunciationDict(newDict);
        }

        setShowModal(false);
        setEditTarget('');
        setEditReplacement('');
        setEditIsRegex(false);
    };

    const renderItem = ({ item }) => (
        <View style={[styles.listItem, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
            <View style={styles.itemContent}>
                <Text style={[styles.targetText, { color: colors.text }]} numberOfLines={3}>{item.isRegex ? `[正則] ${item.target}` : item.target}</Text>
                <Feather name="arrow-right" size={16} color="#888" style={{ marginHorizontal: 8 }} />
                <Text style={[styles.replacementText, { color: item.replacement ? colors.primary : '#888' }]}>
                    {item.replacement || '(刪除)'}
                </Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id, activeTab === 0 ? 'text' : 'voice')} style={styles.deleteBtn}>
                <Feather name="trash-2" size={20} color="#ff4444" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Feather name="arrow-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>字典管理</Text>
                <TouchableOpacity onPress={() => { setEditTarget(''); setEditReplacement(''); setEditIsRegex(false); setShowModal(true); }} style={styles.iconBtn}>
                    <Feather name="plus" size={24} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={[styles.tabContainer, { backgroundColor: colors.surface }]}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 0 && { backgroundColor: colors.primary }]} 
                    onPress={() => setActiveTab(0)}
                >
                    <Text style={[styles.tabText, { color: activeTab === 0 ? '#fff' : colors.text }]}>文字過濾</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 1 && { backgroundColor: colors.primary }]} 
                    onPress={() => setActiveTab(1)}
                >
                    <Text style={[styles.tabText, { color: activeTab === 1 ? '#fff' : colors.text }]}>語音校正</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
                <Text style={{ color: '#888', fontSize: 13, lineHeight: 18 }}>
                    {activeTab === 0 
                        ? "【文字過濾】輸入的目標文字，會在您進入閱讀畫面時自動被替換或隱藏刪除。"
                        : "【語音校正】畫面上的文字不會改變，只會在語音朗讀時偷偷替換成正確讀音。"}
                </Text>
            </View>

            {/* List */}
            <FlatList
                data={activeTab === 0 ? textFilters : pronunciationDict}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#888', marginTop: 50 }}>目前沒有設定規則</Text>}
            />

            {/* Add Modal */}
            <Modal visible={showModal} animationType="fade" transparent={true}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', alignItems: 'center' }}>
                            <TouchableWithoutFeedback onPress={() => {}}>
                                <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                                        新增{activeTab === 0 ? '文字過濾' : '語音校正'}規則
                                    </Text>
                                    
                                    <Text style={[styles.label, { color: colors.text }]}>原詞 (目標尋找文字):</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 80 }]}
                                        placeholder="支援多行輸入"
                                        placeholderTextColor="#888"
                                        multiline={true}
                                        textAlignVertical="top"
                                        value={editTarget}
                                        onChangeText={setEditTarget}
                                    />

                                    {activeTab === 0 && (
                                        <TouchableOpacity 
                                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}
                                            onPress={() => setEditIsRegex(!editIsRegex)}
                                        >
                                            <Feather name={editIsRegex ? 'check-square' : 'square'} size={20} color={colors.primary} />
                                            <Text style={{ color: colors.text, marginLeft: 8 }}>使用正規表達式 (Regex) - 支援模糊刪除</Text>
                                        </TouchableOpacity>
                                    )}

                                    <Text style={[styles.label, { color: colors.text, marginTop: 15 }]}>
                                        {activeTab === 0 ? '替換為 (留空代表直接刪除):' : '替換為正確發音詞:'}
                                    </Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 50 }]}
                                        placeholder={activeTab === 0 ? "留空即可" : "例如：主決"}
                                        placeholderTextColor="#888"
                                        multiline={true}
                                        value={editReplacement}
                                        onChangeText={setEditReplacement}
                                    />

                                    <View style={styles.modalActions}>
                                        <TouchableOpacity style={[styles.btn, { backgroundColor: '#555' }]} onPress={() => setShowModal(false)}>
                                            <Text style={styles.btnText}>取消</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                                            <Text style={styles.btnText}>儲存</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </BlurView>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingTop: 50, paddingBottom: 15, borderBottomWidth: 1 },
    headerTitle: { fontSize: 20, fontWeight: 'bold' },
    iconBtn: { padding: 5 },
    tabContainer: { flexDirection: 'row', margin: 15, borderRadius: 8, overflow: 'hidden' },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 16, fontWeight: '600' },
    infoBox: { paddingHorizontal: 20, paddingBottom: 10 },
    listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4 },
    itemContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    targetText: { fontSize: 16, fontWeight: '500' },
    replacementText: { fontSize: 16 },
    deleteBtn: { padding: 5, paddingLeft: 15 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { width: '85%', padding: 25, borderRadius: 16, borderWidth: 1 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    label: { fontSize: 14, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
    btn: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
