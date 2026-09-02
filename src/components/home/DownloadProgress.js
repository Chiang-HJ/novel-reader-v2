import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function DownloadProgress({ queue, activeTask, progressText, cancelDownload, colors, activeTaskProgress, retryChapterDownload, novelId }) {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [retryingIndex, setRetryingIndex] = useState(null);
    const [isMinimized, setIsMinimized] = useState(false);

    if (!activeTask && queue.length === 0) return null;

    // Minimized pill view
    if (isMinimized) {
        return (
            <TouchableOpacity
                style={[styles.minimizedPill, { backgroundColor: colors.primary }]}
                onPress={() => setIsMinimized(false)}
                activeOpacity={0.85}
            >
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.minimizedText} numberOfLines={1}>
                    {progressText || '下載中...'}
                </Text>
                <Feather name="chevron-up" size={14} color="#fff" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
        );
    }

    return (
        <View style={[styles.queueContainer, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Feather name="download-cloud" size={18} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>
                    背景下載 <Text style={{ color: colors.primary, fontSize: 13 }}>({queue.length} 本)</Text>
                </Text>
                <TouchableOpacity onPress={() => setIsMinimized(true)} style={styles.iconBtn}>
                    <Feather name="minus" size={18} color={colors.text} />
                </TouchableOpacity>
            </View>

            {activeTask && (
                <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                            <Feather name="play-circle" size={13} color={colors.primary} style={{ marginRight: 5 }} />
                            <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
                                {activeTask.title || activeTask.url}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => cancelDownload(activeTask.id || activeTask.url)} style={{ padding: 4 }}>
                            <Feather name="x-circle" size={16} color="#FF3B30" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.primary, fontSize: 12, flex: 1 }}>{progressText}</Text>
                    </View>
                    {activeTaskProgress && activeTaskProgress.length > 0 && (
                        <TouchableOpacity
                            style={{ marginTop: 6, padding: 5, backgroundColor: colors.background, borderRadius: 6, alignItems: 'center' }}
                            onPress={() => setIsModalVisible(true)}
                        >
                            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold' }}>檢視下載詳情</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {queue.slice(activeTask ? 1 : 0).map((q) => (
                <View key={q.url} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <Feather name="clock" size={13} color={colors.textSecondary} style={{ marginRight: 5 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                            等待中: {q.title || q.url}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => cancelDownload(q.id || q.url)} style={{ padding: 4 }}>
                        <Feather name="x" size={15} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            ))}

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: colors.background, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                <Feather name="moon" size={11} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1 }}>
                    已啟動背景保活與防休眠，鎖定螢幕或切換 App 仍會持續下載。
                </Text>
            </View>

            <Modal visible={isModalVisible} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <Text style={{ color: colors.text, fontSize: 18, fontWeight: 'bold' }}>章節下載進度</Text>
                            <TouchableOpacity onPress={() => setIsModalVisible(false)} style={{ padding: 5 }}>
                                <Feather name="x" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={activeTaskProgress || []}
                            keyExtractor={(item) => item.index.toString()}
                            renderItem={({ item }) => {
                                let iconName = "clock";
                                let iconColor = colors.textSecondary;
                                if (item.status === 'downloading') {
                                    iconColor = colors.primary;
                                } else if (item.status === 'success') {
                                    iconName = "check-circle";
                                    iconColor = "#34C759";
                                } else if (item.status === 'error') {
                                    iconName = "alert-circle";
                                    iconColor = "#FF3B30";
                                }

                                const isRetrying = retryingIndex === item.index;

                                return (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                        {item.status === 'downloading' ? (
                                            <ActivityIndicator size="small" color={colors.primary} style={{ width: 20, marginRight: 10 }} />
                                        ) : (
                                            <Feather name={iconName} size={20} color={iconColor} style={{ width: 20, marginRight: 10 }} />
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>{item.title}</Text>
                                            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                                {item.status === 'pending' && '等待下載...'}
                                                {item.status === 'downloading' && '下載中...'}
                                                {item.status === 'success' && '下載成功'}
                                                {item.status === 'error' && '下載失敗'}
                                            </Text>
                                        </View>
                                        {item.status === 'error' && retryChapterDownload && (
                                            <TouchableOpacity
                                                style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.background, borderRadius: 15, borderWidth: 1, borderColor: colors.border }}
                                                onPress={async () => {
                                                    setRetryingIndex(item.index);
                                                    await retryChapterDownload(novelId, item.index, item.url, item.title);
                                                    setRetryingIndex(null);
                                                }}
                                                disabled={isRetrying}
                                            >
                                                {isRetrying ? (
                                                    <ActivityIndicator size="small" color={colors.primary} />
                                                ) : (
                                                    <Text style={{ color: colors.text, fontSize: 12 }}>重試</Text>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    queueContainer: {
        padding: 14,
        borderRadius: 14,
        marginBottom: 16,
        marginHorizontal: 16,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    iconBtn: {
        padding: 4,
    },
    minimizedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        marginHorizontal: 16,
        marginBottom: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    minimizedText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        flex: 1,
        maxWidth: 200,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        height: '80%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40
    }
});

