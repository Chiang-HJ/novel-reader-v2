import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function FolderListItem({ folder, onPress, colors }) {
    return (
        <TouchableOpacity 
            style={[styles.folderItem, { backgroundColor: colors.surface, shadowColor: '#000' }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.iconWrapper, { backgroundColor: colors.background }]}>
                <Feather name="folder" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.folderTitle, { color: colors.text }]}>{folder.name}</Text>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} style={styles.chevron} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    folderItem: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 16, 
        borderRadius: 16, 
        marginBottom: 16,
        marginHorizontal: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    iconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    folderTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
    chevron: { opacity: 0.5 },
});
