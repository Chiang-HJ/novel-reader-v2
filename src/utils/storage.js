import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const NOVELS_KEY = '@novels_list';

export const saveNovelToBookshelf = async (novelInfo) => {
    const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
    let currentList = currentListStr ? JSON.parse(currentListStr) : [];
    
    currentList = currentList.filter(n => n.id !== novelInfo.id);
    currentList.unshift({
        id: novelInfo.id,
        url: novelInfo.url,
        title: novelInfo.title,
        cover: novelInfo.cover,
        chapters: novelInfo.chapters, // Save chapter list here
        chapterCount: novelInfo.chapters.length,
        progressIndex: 0,
        progressSentence: 0
    });
    await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
};

export const getBookshelf = async () => {
    const listStr = await AsyncStorage.getItem(NOVELS_KEY);
    return listStr ? JSON.parse(listStr) : [];
};

export const getNovelById = async (novelId) => {
    const list = await getBookshelf();
    return list.find(n => n.id === novelId);
};

export const updateReadingProgress = async (novelId, chapterIndex, sentenceIndex) => {
    const list = await getBookshelf();
    const index = list.findIndex(n => n.id === novelId);
    if (index !== -1) {
        list[index].progressIndex = chapterIndex;
        list[index].progressSentence = sentenceIndex;
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(list));
    }
};

export const deleteNovel = async (novelId) => {
    const list = await getBookshelf();
    const newList = list.filter(n => n.id !== novelId);
    await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(newList));
    
    const dir = getNovelDir(novelId);
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (dirInfo.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
    }
};

export const getNovelDir = (novelId) => {
    return FileSystem.documentDirectory + `novels/${novelId}/`;
};

export const saveChapterText = async (novelId, chapterIndex, title, text) => {
    const dir = getNovelDir(novelId);
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const filePath = dir + `${chapterIndex}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify({ title, text }));
};

export const getChapterText = async (novelId, chapterIndex) => {
    const filePath = getNovelDir(novelId) + `${chapterIndex}.json`;
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(filePath);
    return JSON.parse(content);
};
