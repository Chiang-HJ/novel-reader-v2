import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function NovelListItem({ item, onPress, onMove, onDelete, customActions, colors, isDark }) {
    const progressPercent = item.chapterCount > 0 ? ((item.downloadedChapters || 0) / item.chapterCount) * 100 : 0;
    const readingPercent = item.chapterCount > 0 ? (((item.progressIndex || 0) + 1) / item.chapterCount) * 100 : 0;

    return (
        <TouchableOpacity 
            style={[styles.bookItem, { 
                backgroundColor: colors.surface, 
                shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.08)',
                elevation: isDark ? 4 : 8,
            }]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <View style={styles.coverWrapper}>
                {item.cover ? (
                    <Image source={{uri: item.cover}} style={styles.cover} />
                ) : (
                    <View style={[styles.coverPlaceholder, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                        <Feather name="book-open" size={32} color={colors.textSecondary} style={{ opacity: 0.5 }} />
                    </View>
                )}
                {item.downloadedChapters > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.downloadedChapters === item.chapterCount ? '全本' : '已載'}</Text>
                    </View>
                )}
            </View>
            
            <View style={styles.bookInfo}>
                <View style={styles.titleRow}>
                    <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                </View>
                
                <Text style={[styles.bookSubtitle, { color: colors.textSecondary }]}>
                    {item.author || '未知作者'}  ·  {item.chapterCount} 章
                </Text>
                
                <View style={{ flex: 1 }} />
                
                <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                        <Text style={[styles.progressText, { color: colors.primary }]}>
                            進度 {(item.progressIndex || 0) + 1} 章
                        </Text>
                        <Text style={[styles.progressPercent, { color: colors.textSecondary }]}>
                            {Math.round(readingPercent)}%
                        </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <View style={[styles.progressBarFill, { width: `${readingPercent}%`, backgroundColor: colors.primary }]} />
                    </View>
                </View>
            </View>
            
            <View style={styles.actionColumn}>
                {customActions ? customActions : (
                    <>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} onPress={onMove}>
                            <Feather name="folder-plus" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <View style={{ height: 12 }} />
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.05)' }]} onPress={onDelete}>
                            <Feather name="trash-2" size={18} color="#FF3B30" />
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    bookItem: { 
        flexDirection: 'row', 
        padding: 20, 
        borderRadius: 24, 
        marginBottom: 20, 
        marginHorizontal: 16,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 1,
        shadowRadius: 24,
    },
    coverWrapper: { 
        marginRight: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
    },
    cover: { width: 90, height: 130, borderRadius: 12 },
    coverPlaceholder: { width: 90, height: 130, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    badge: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#34C759',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        shadowColor: '#34C759',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    badgeText: { color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    bookInfo: { flex: 1, justifyContent: 'flex-start', paddingVertical: 4 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    bookTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6, lineHeight: 26, letterSpacing: 0.3 },
    bookSubtitle: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
    progressContainer: { marginTop: 'auto' },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
    progressText: { fontSize: 13, fontWeight: '700' },
    progressPercent: { fontSize: 12, fontWeight: '600' },
    progressBarBg: { height: 6, borderRadius: 3, width: '100%', overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3 },
    actionColumn: { justifyContent: 'center', alignItems: 'center', paddingLeft: 16 },
    actionBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});
