import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const NOVELS_KEY = '@novels_list';

export const saveNovelToBookshelf = async (novelInfo) => {
    const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
    let currentList = currentListStr ? JSON.parse(currentListStr) : [];
    
    const existing = currentList.find(n => n.id === novelInfo.id);
    currentList = currentList.filter(n => n.id !== novelInfo.id);
    
    currentList.unshift({
        ...existing,
        id: novelInfo.id,
        url: novelInfo.url,
        title: novelInfo.title,
        cover: novelInfo.cover,
        chapters: novelInfo.chapters,
        chapterCount: novelInfo.chapters ? novelInfo.chapters.length : (novelInfo.chapterCount || 0),
        progressIndex: existing ? existing.progressIndex : 0,
        progressSentence: existing ? existing.progressSentence : 0,
        downloadedChapters: novelInfo.downloadedChapters !== undefined ? novelInfo.downloadedChapters : (existing ? existing.downloadedChapters : 0)
    });
    await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
};

export const moveNovelToFolder = async (novelId, folderId) => {
    const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
    if (!currentListStr) return;
    const currentList = JSON.parse(currentListStr);
    
    const index = currentList.findIndex(n => n.id === novelId);
    if (index !== -1) {
        currentList[index].folderId = folderId;
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
    }
};

export const getBookshelf = async () => {
    try {
        const listStr = await AsyncStorage.getItem(NOVELS_KEY);
        return listStr ? JSON.parse(listStr) : [];
    } catch (e) {
        console.error('getBookshelf error:', e);
        return [];
    }
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

export const getStorageUsage = async () => {
    try {
        const novelsDir = FileSystem.documentDirectory + 'novels/';
        const dirInfo = await FileSystem.getInfoAsync(novelsDir);
        if (!dirInfo.exists) return '0 MB';

        let totalBytes = 0;
        let fileCount = 0;
        
        // Helper to yield back to JS thread so UI doesn't freeze during heavy async iteration
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

        const novels = await FileSystem.readDirectoryAsync(novelsDir);
        for (const novelId of novels) {
            const novelPath = novelsDir + novelId + '/';
            const novelInfo = await FileSystem.getInfoAsync(novelPath);
            if (novelInfo.isDirectory) {
                const chapters = await FileSystem.readDirectoryAsync(novelPath);
                for (const chapter of chapters) {
                    const chapterInfo = await FileSystem.getInfoAsync(novelPath + chapter);
                    if (chapterInfo.exists) {
                        totalBytes += chapterInfo.size || 0;
                    }
                    
                    fileCount++;
                    // Yield every 50 files to prevent JS thread starvation / touch unresponsiveness
                    if (fileCount % 50 === 0) {
                        await yieldToMain();
                    }
                }
            }
        }
        
        const mb = totalBytes / (1024 * 1024);
        return mb.toFixed(2) + ' MB';
    } catch (e) {
        console.warn('Failed to calculate storage', e);
        return '未知';
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
