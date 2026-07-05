import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const NOVELS_KEY = '@novels_list';

// Helper to get individual novel key
const getNovelKey = (id) => `@novel_meta_${id}`;

// Concurrency Mutex
let storageMutex = Promise.resolve();
const lockStorage = async (task) => {
    let release;
    const next = new Promise(resolve => release = resolve);
    const prev = storageMutex;
    storageMutex = storageMutex.then(() => next);
    try {
        await prev;
        return await task();
    } finally {
        release();
    }
};

export const saveNovelToBookshelf = async (novelInfo) => {
    return lockStorage(async () => {
        // Save lightweight summary to list
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        
        const existing = currentList.find(n => n.id === novelInfo.id);
        currentList = currentList.filter(n => n.id !== novelInfo.id);
        
        const summary = {
            id: novelInfo.id,
            url: novelInfo.url,
            title: novelInfo.title,
            cover: novelInfo.cover,
            chapterCount: novelInfo.chapters ? novelInfo.chapters.length : (novelInfo.chapterCount || 0),
            progressIndex: existing ? existing.progressIndex : 0,
            progressSentence: existing ? existing.progressSentence : 0,
            downloadedChapters: novelInfo.downloadedChapters !== undefined ? novelInfo.downloadedChapters : (existing ? existing.downloadedChapters : 0),
            folderId: existing ? existing.folderId : (novelInfo.folderId || null),
            isHidden: existing ? existing.isHidden : (novelInfo.isHidden || false)
        };
        
        currentList.unshift(summary);
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));

        // Save heavy full metadata (with chapters) to separate key
        const fullNovel = { ...novelInfo, ...summary };
        await AsyncStorage.setItem(getNovelKey(novelInfo.id), JSON.stringify(fullNovel));
    });
};

export const getBookshelf = async () => {
    try {
        const listStr = await AsyncStorage.getItem(NOVELS_KEY);
        return listStr ? JSON.parse(listStr) : [];
    } catch (e) {
        console.error('getBookshelf error', e);
        return [];
    }
};

export const getNovelMetadata = async (novelId) => {
    try {
        const dataStr = await AsyncStorage.getItem(getNovelKey(novelId));
        if (dataStr) return JSON.parse(dataStr);
        
        // Backward compatibility: fetch from list if separate key not found
        const list = await getBookshelf();
        return list.find(n => n.id === novelId);
    } catch (e) {
        console.error('getNovelMetadata error', e);
        return null;
    }
};

export const updateNovelMetadata = async (novelId, updates) => {
    return lockStorage(async () => {
        // Update full metadata
        const fullNovel = await getNovelMetadata(novelId);
        if (fullNovel) {
            const updatedNovel = { ...fullNovel, ...updates };
            await AsyncStorage.setItem(getNovelKey(novelId), JSON.stringify(updatedNovel));
        }

        // Update list summary
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        const index = currentList.findIndex(n => n.id === novelId);
        if (index !== -1) {
            currentList[index] = { ...currentList[index], ...updates };
            // Ensure chapters array isn't accidentally pushed back into the list
            delete currentList[index].chapters;
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        }
    });
};

export const moveNovelToFolder = async (novelId, folderId) => {
    await updateNovelMetadata(novelId, { folderId });
};

export const toggleNovelVisibility = async (novelId) => {
    const list = await getBookshelf();
    const novel = list.find(n => n.id === novelId);
    if (novel) {
        await updateNovelMetadata(novelId, { isHidden: !novel.isHidden });
    }
};

export const updateReadingProgress = async (novelId, progressIndex, progressSentence = 0) => {
    await updateNovelMetadata(novelId, { progressIndex, progressSentence });
};

export const deleteNovel = async (novelId) => {
    return lockStorage(async () => {
        // Remove from list
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        currentList = currentList.filter(n => n.id !== novelId);
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));

        // Remove full metadata
        await AsyncStorage.removeItem(getNovelKey(novelId));

        // Delete files
        const folderPath = `${FileSystem.documentDirectory}novels/${novelId}/`;
        try {
            const info = await FileSystem.getInfoAsync(folderPath);
            if (info.exists) {
                await FileSystem.deleteAsync(folderPath, { idempotent: true });
            }
        } catch (e) {
            console.error('Failed to delete novel files', e);
        }
    });
};


export const getNovelById = getNovelMetadata;

export const getStorageUsage = async () => {
    try {
        const novelDir = `${FileSystem.documentDirectory}novels/`;
        const vaultDir = `${FileSystem.documentDirectory}vault_media/`;
        let totalBytes = 0;

        for (const dir of [novelDir, vaultDir]) {
            const info = await FileSystem.getInfoAsync(dir);
            if (info.exists) {
                totalBytes += info.size || 0;
            }
        }

        if (totalBytes < 1024) return `${totalBytes} B`;
        if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
        if (totalBytes < 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } catch (e) {
        return '無法計算';
    }
};

export const getNovelDir = (novelId) => {
    return `${FileSystem.documentDirectory}novels/${novelId}/`;
};

export const saveChapterText = async (novelId, chapterIndex, title, text) => {
    const folderPath = getNovelDir(novelId);
    try {
        const info = await FileSystem.getInfoAsync(folderPath);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
        }
        
        // We use chapterIndex for backward compatibility, but we should make sure it's safely written
        const fileId = typeof chapterIndex === 'number' ? chapterIndex.toString() : chapterIndex;
        const filePath = `${folderPath}${fileId}.json`;
        
        const data = { title, text, id: fileId };
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        
        return fileId;
    } catch (e) {
        console.error('Error saving chapter text', e);
        throw e;
    }
};

export const getChapterText = async (novelId, fileId) => {
    // Add .json if missing
    let fileName = typeof fileId === 'number' ? fileId.toString() : fileId;
    if (!fileName.endsWith('.json')) {
        fileName = fileName + '.json';
    }

    const filePath = `${getNovelDir(novelId)}${fileName}`;
    try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists) {
            const content = await FileSystem.readAsStringAsync(filePath, { encoding: 'utf8' });
            return JSON.parse(content);
        }
        return null;
    } catch (e) {
        console.error('Error reading chapter text', e);
        return null;
    }
};

export const deleteChapterData = async (novelId, index) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');
        if (index < 0 || index >= fullNovel.chapters.length) throw new Error('Invalid chapter index');

        const filePath = `${getNovelDir(novelId)}${index}.json`;
        try {
            const info = await FileSystem.getInfoAsync(filePath);
            if (info.exists) {
                await FileSystem.deleteAsync(filePath, { idempotent: true });
            }
        } catch (e) {
            console.error('Error deleting chapter file', e);
        }

        // Shift existing chapter files up to fill the gap
        for (let i = index + 1; i < fullNovel.chapters.length; i++) {
            const oldPath = `${getNovelDir(novelId)}${i}.json`;
            const newPath = `${getNovelDir(novelId)}${i - 1}.json`;
            try {
                const info = await FileSystem.getInfoAsync(oldPath);
                if (info.exists) {
                    await FileSystem.moveAsync({ from: oldPath, to: newPath });
                }
            } catch (e) {
                console.error('Error shifting chapter file', e);
            }
        }

        // Update metadata
        fullNovel.chapters.splice(index, 1);
        fullNovel.chapterCount = fullNovel.chapters.length;
        if (fullNovel.downloadedChapters > 0) {
            fullNovel.downloadedChapters = Math.max(0, fullNovel.downloadedChapters - 1);
        }
        
        // Adjust progressIndex if needed
        if (fullNovel.progressIndex >= fullNovel.chapters.length) {
            fullNovel.progressIndex = Math.max(0, fullNovel.chapters.length - 1);
            fullNovel.progressSentence = 0;
        }

        // Update full metadata
        await AsyncStorage.setItem(getNovelKey(novelId), JSON.stringify(fullNovel));

        // Update list summary
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        const listIndex = currentList.findIndex(n => n.id === novelId);
        if (listIndex !== -1) {
            currentList[listIndex] = { 
                ...currentList[listIndex], 
                chapterCount: fullNovel.chapterCount, 
                downloadedChapters: fullNovel.downloadedChapters, 
                progressIndex: fullNovel.progressIndex 
            };
            delete currentList[listIndex].chapters;
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        }
    });
};

export const addChapterData = async (novelId, insertIndex, title, text) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');
        
        // Shift existing chapter files down to make room
        for (let i = fullNovel.chapters.length - 1; i >= insertIndex; i--) {
            const oldPath = `${getNovelDir(novelId)}${i}.json`;
            const newPath = `${getNovelDir(novelId)}${i + 1}.json`;
            try {
                const info = await FileSystem.getInfoAsync(oldPath);
                if (info.exists) {
                    await FileSystem.moveAsync({ from: oldPath, to: newPath });
                }
            } catch (e) {
                console.error('Error shifting chapter file', e);
            }
        }
        
        // Save the new chapter
        await saveChapterText(novelId, insertIndex, title, text);
        
        // Update chapters array
        const newChapter = { title, url: insertIndex };
        fullNovel.chapters.splice(insertIndex, 0, newChapter);
        
        // Update URLs for shifted chapters
        for (let i = insertIndex + 1; i < fullNovel.chapters.length; i++) {
            fullNovel.chapters[i].url = i;
        }
        
        fullNovel.chapterCount = fullNovel.chapters.length;
        
        // Update metadata
        await AsyncStorage.setItem(getNovelKey(novelId), JSON.stringify(fullNovel));
        
        // Update list summary
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        const idx = currentList.findIndex(n => n.id === novelId);
        if (idx !== -1) {
            currentList[idx].chapterCount = fullNovel.chapterCount;
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        }
    });
};

export const replaceNovelChapters = async (novelId, newChaptersData) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');

        const folderPath = getNovelDir(novelId);
        const folderInfo = await FileSystem.getInfoAsync(folderPath);
        if (!folderInfo.exists) {
            await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
        }
        
        // 1. Delete all existing chapter files
        for (let i = 0; i < fullNovel.chapters.length; i++) {
            const oldPath = `${folderPath}${i}.json`;
            try {
                const info = await FileSystem.getInfoAsync(oldPath);
                if (info.exists) {
                    await FileSystem.deleteAsync(oldPath, { idempotent: true });
                }
            } catch (e) {}
        }
        
        // 2. Write new chapter files
        fullNovel.chapters = [];
        for (let i = 0; i < newChaptersData.length; i++) {
            const chapterPath = `${folderPath}${i}.json`;
            const chapterData = {
                id: novelId,
                index: i,
                title: newChaptersData[i].title,
                text: newChaptersData[i].text
            };
            await FileSystem.writeAsStringAsync(chapterPath, JSON.stringify(chapterData), { encoding: 'utf8' });
            
            fullNovel.chapters.push({
                title: newChaptersData[i].title,
                url: newChaptersData[i].url !== undefined ? newChaptersData[i].url : i
            });
        }
        
        // 3. Update metadata
        fullNovel.chapterCount = fullNovel.chapters.length;
        fullNovel.downloadedChapters = fullNovel.chapterCount;
        fullNovel.progressIndex = 0;
        fullNovel.progressSentence = 0;
        
        await AsyncStorage.setItem(getNovelKey(novelId), JSON.stringify(fullNovel));
        
        // Update list summary
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        const listIndex = currentList.findIndex(n => n.id === novelId);
        if (listIndex !== -1) {
            currentList[listIndex] = { 
                ...currentList[listIndex], 
                chapterCount: fullNovel.chapterCount, 
                downloadedChapters: fullNovel.downloadedChapters, 
                progressIndex: fullNovel.progressIndex,
                progressSentence: fullNovel.progressSentence
            };
            delete currentList[listIndex].chapters;
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        }
    });
};

export const getAllChapterText = async (novelId) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');
        
        let fullText = '';
        for (let i = 0; i < fullNovel.chapters.length; i++) {
            const filePath = `${getNovelDir(novelId)}${i}.json`;
            try {
                const info = await FileSystem.getInfoAsync(filePath);
                if (info.exists) {
                    const content = await FileSystem.readAsStringAsync(filePath, { encoding: 'utf8' });
                    const parsed = JSON.parse(content);
                    // Add chapter title back into the text to ensure it can be re-split if it matches the regex
                    fullText += `\n\n${parsed.title}\n\n${parsed.text}`;
                }
            } catch (e) {}
        }
        return fullText;
    });
};

export const splitChapterData = async (novelId, index, newChaptersData) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');
        
        const shiftCount = newChaptersData.length - 1;
        
        // Shift existing chapter files down to make room
        if (shiftCount > 0) {
            for (let i = fullNovel.chapters.length - 1; i > index; i--) {
                const oldPath = `${getNovelDir(novelId)}${i}.json`;
                const newPath = `${getNovelDir(novelId)}${i + shiftCount}.json`;
                try {
                    const info = await FileSystem.getInfoAsync(oldPath);
                    if (info.exists) {
                        await FileSystem.moveAsync({ from: oldPath, to: newPath });
                    }
                } catch (e) {
                    console.error('Error shifting chapter file', e);
                }
            }
        }
        
        // Save the new chapters
        for (let i = 0; i < newChaptersData.length; i++) {
            const ch = newChaptersData[i];
            const path = `${getNovelDir(novelId)}${index + i}.json`;
            await FileSystem.writeAsStringAsync(path, JSON.stringify({ title: ch.title, text: ch.text }));
        }
        
        // Update chapters array
        const insertedChapters = newChaptersData.map((ch, i) => ({ title: ch.title, url: index + i }));
        fullNovel.chapters.splice(index, 1, ...insertedChapters);
        
        // Update URLs for shifted chapters
        for (let i = index + newChaptersData.length; i < fullNovel.chapters.length; i++) {
            fullNovel.chapters[i].url = i;
        }
        
        fullNovel.chapterCount = fullNovel.chapters.length;
        
        // Update metadata
        await AsyncStorage.setItem(getNovelKey(novelId), JSON.stringify(fullNovel));
        
        // Update list summary
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        const idx = currentList.findIndex(n => n.id === novelId);
        if (idx !== -1) {
            currentList[idx].chapterCount = fullNovel.chapterCount;
            await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        }
    });
};
