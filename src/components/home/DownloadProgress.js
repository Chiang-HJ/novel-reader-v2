import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function DownloadProgress({ queue, activeTask, progressText, cancelDownload, colors }) {
    if (!activeTask && queue.length === 0) return null;

    return (
        <View style={[styles.queueContainer, { backgroundColor: colors.surface, shadowColor: '#000' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Feather name="download-cloud" size={20} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                    背景下載佇列 <Text style={{ color: colors.primary, fontSize: 14 }}>({queue.length} 本)</Text>
                </Text>
            </View>
            {activeTask && (
                <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                            <Feather name="play-circle" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
                                正在處理: {activeTask.url}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => cancelDownload(activeTask.url)} style={{ padding: 4 }}>
                            <Feather name="x-circle" size={16} color={colors.danger} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.primary, fontSize: 12, flex: 1 }}>{progressText}</Text>
                    </View>
                </View>
            )}
            {queue.slice(activeTask ? 1 : 0).map((q) => (
                <View key={q.addedAt} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <Feather name="clock" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                            等待中: {q.url}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => cancelDownload(q.url)} style={{ padding: 4 }}>
                        <Feather name="x" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            ))}
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 8 }}>
                下載期間可離開此畫面，或點選書櫃閱讀其他小說。
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    queueContainer: { 
        padding: 16, 
        borderRadius: 16, 
        marginBottom: 20,
        marginHorizontal: 20,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
});
