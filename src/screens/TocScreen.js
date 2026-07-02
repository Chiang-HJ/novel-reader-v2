import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { getNovelById } from '../utils/storage';

export default function TocScreen({ route, navigation }) {
    const { colors, isDark } = useTheme();
    const [novel, setNovel] = useState(route.params.novel);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            getNovelById(novel.id).then(n => {
                if (isActive && n) {
                    setNovel(n);
                }
            });
            return () => { isActive = false; };
        }, [novel.id])
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <FlatList 
                data={novel.chapters}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item, index }) => {
                    const isCurrent = novel.progressIndex === index;
                    return (
                        <TouchableOpacity 
                            style={[
                                styles.item, 
                                { borderBottomColor: colors.border },
                                isCurrent && { backgroundColor: isDark ? '#2d3748' : '#e6f7ff' }
                            ]}
                            onPress={() => {
                                navigation.navigate('Reader', { novelId: novel.id, initialChapterIndex: index });
                            }}
                        >
                            <Text style={[
                                styles.title,
                                { color: isCurrent ? colors.primary : colors.text },
                                isCurrent && { fontWeight: 'bold' }
                            ]}>
                                {item.title}
                            </Text>
                        </TouchableOpacity>
                    );
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    item: { padding: 16, borderBottomWidth: 1 },
    title: { fontSize: 16 }
});
