import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const NOVELS_KEY = '@novels_list';

// Helper to get individual novel key
const getNovelKey = (id) => `@novel_meta_${id}`;

// Concurrency Mutex
let storageMutex = Promise.resolve();
export const lockStorage = async (task) => {
    let release;
    const next = new Promise(resolve => release = resolve);
    const prev = storageMutex;
    storageMutex = prev.catch(() => {}).then(() => next);
    try {
        await prev.catch(() => {});
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
            type: novelInfo.type || (existing ? existing.type : 'novel'),
            chapterCount: novelInfo.chapters ? novelInfo.chapters.length : (novelInfo.chapterCount || 0),
            progressIndex: existing ? existing.progressIndex : 0,
            progressSentence: existing ? existing.progressSentence : 0,
            downloadedChapters: novelInfo.downloadedChapters !== undefined ? novelInfo.downloadedChapters : (existing ? existing.downloadedChapters : 0),
            folderId: existing ? existing.folderId : (novelInfo.folderId || null),
            isHidden: existing ? existing.isHidden : (novelInfo.isHidden || false),
            author: novelInfo.author || (existing ? existing.author : null)
        };
        
        currentList.unshift(summary);
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));

        // Save heavy full metadata (with chapters) to separate key
        const existingFullStr = await AsyncStorage.getItem(getNovelKey(novelInfo.id));
        const existingFull = existingFullStr ? JSON.parse(existingFullStr) : null;
        
        const fullNovel = { ...existingFull, ...novelInfo, ...summary };
        
        // Preserve existing chapters if novelInfo doesn't have them
        if (existingFull && existingFull.chapters && existingFull.chapters.length > 0) {
            if (!novelInfo.chapters || novelInfo.chapters.length === 0) {
                fullNovel.chapters = existingFull.chapters;
            } else if (fullNovel.type === 'comic') {
                // For comics, don't overwrite chapters blindly. Preserve existing chapters up to existing length.
                fullNovel.chapters = novelInfo.chapters.map((ch, i) => {
                    const existingCh = existingFull.chapters[i];
                    return existingCh ? { ...ch, ...existingCh } : ch;
                });
            }
        }
        
        await AsyncStorage.setItem(getNovelKey(novelInfo.id), JSON.stringify(fullNovel));
        // Invalidate storage usage cache whenever a new book is saved

    });
};

export const getBookshelf = async () => {
    try {
        const listStr = await AsyncStorage.getItem(NOVELS_KEY);
        if (!listStr) return [];
        
        let list = JSON.parse(listStr);
        let needsMigration = false;
        
        // Strip heavy chapters array from older saved novels to drastically improve performance
        // BUT make sure to save the full object to the separate key first!
        for (let i = 0; i < list.length; i++) {
            const novel = list[i];
            if (novel.chapters) {
                needsMigration = true;
                
                // Save to separate key if it doesn't already exist
                const key = getNovelKey(novel.id);
                const existing = await AsyncStorage.getItem(key);
                if (!existing) {
                    await AsyncStorage.setItem(key, JSON.stringify(novel));
                }
                
                // Strip from summary list
                const { chapters, ...rest } = novel;
                list[i] = rest;
            }
        }
        
        if (needsMigration) {
            // Fire and forget the save to not block the current read
            AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(list)).catch(() => {});
        }
        
        return list;
    } catch (e) {
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

        return null;
    }
};

export const togglePinNovel = async (novelId) => {
    const list = await getBookshelf();
    const novel = list.find(n => n.id === novelId);
    if (!novel) return;
    const newPinned = !novel.isPinned;
    await updateNovelMetadata(novelId, {
        isPinned: newPinned,
        pinnedAt: newPinned ? Date.now() : null,
    });
    return newPinned;
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
    try {
        await updateNovelMetadata(novelId, { folderId });
    } catch(e) {}
};

export const batchMoveNovels = async (novelIds, folderId) => {
    return lockStorage(async () => {
        const idSet = new Set(novelIds);
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        
        currentList = currentList.map(n => {
            if (idSet.has(n.id)) {
                return { ...n, folderId };
            }
            return n;
        });
        
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));
        
        // Also update individual full meta
        for (const id of novelIds) {
            try {
                const fullStr = await AsyncStorage.getItem(getNovelKey(id));
                if (fullStr) {
                    const full = JSON.parse(fullStr);
                    full.folderId = folderId;
                    await AsyncStorage.setItem(getNovelKey(id), JSON.stringify(full));
                }
            } catch (e) {}
        }
    });
};

export const toggleNovelVisibility = async (novelId) => {
    try {
        const list = await getBookshelf();
        const novel = list.find(n => n.id === novelId);
        if (novel) {
            await updateNovelMetadata(novelId, { isHidden: !novel.isHidden });
        }
    } catch(e) {}
};

export const updateReadingProgress = async (novelId, progressIndex, progressSentence = 0) => {
    try {
        await updateNovelMetadata(novelId, { progressIndex, progressSentence });
    } catch(e) {}
};

export const deleteNovel = async (novelId) => {
    return batchDeleteNovels([novelId]);
};

export const batchDeleteNovels = async (novelIds) => {
    return lockStorage(async () => {
        const idSet = new Set(novelIds);
        
        // Remove from list in one pass
        const currentListStr = await AsyncStorage.getItem(NOVELS_KEY);
        let currentList = currentListStr ? JSON.parse(currentListStr) : [];
        currentList = currentList.filter(n => !idSet.has(n.id));
        await AsyncStorage.setItem(NOVELS_KEY, JSON.stringify(currentList));

        // Remove full metadata and files for each
        try {
            await AsyncStorage.multiRemove(Array.from(idSet).map(getNovelKey));
        } catch(e) {}

        for (const novelId of novelIds) {
            try {
                const folderPath = `${FileSystem.documentDirectory}novels/${novelId}/`;
                const info = await FileSystem.getInfoAsync(folderPath);
                if (info.exists) {
                    await FileSystem.deleteAsync(folderPath, { idempotent: true });
                }
            } catch (e) {}
        }
        // Invalidate storage usage cache after deletion (disk space freed)

    });
};

export const getNovelById = getNovelMetadata;

export const getNovelDir = (novelId) => {
    return `${FileSystem.documentDirectory}novels/${novelId}/`;
};

const verifiedNovelDirs = new Set();

export const ensureNovelDir = async (novelId) => {
    const folderPath = getNovelDir(novelId);
    if (!verifiedNovelDirs.has(folderPath)) {
        try {
            const info = await FileSystem.getInfoAsync(folderPath);
            if (!info.exists) {
                await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
            }
            verifiedNovelDirs.add(folderPath);
        } catch (e) {}
    }
    return folderPath;
};

export const saveChapterText = async (novelId, chapterIndex, title, text) => {
    try {
        const folderPath = await ensureNovelDir(novelId);
        
        // We use chapterIndex for backward compatibility, but we should make sure it's safely written
        const fileId = typeof chapterIndex === 'number' ? chapterIndex.toString() : chapterIndex;
        const filePath = `${folderPath}${fileId}.json`;
        
        const data = { title, text, id: fileId };
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        // Invalidate storage usage cache (new file written to disk)

        return fileId;
    } catch (e) {
        throw e;
    }
};

export const saveComicImage = async (novelId, chapterId, imageIndex, imageData, cookieStr = '') => {
    const imagesDir = `${getNovelDir(novelId)}images/`;
    try {
        const info = await FileSystem.getInfoAsync(imagesDir);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
        }
        
        let fileName = `${chapterId}_${imageIndex}.jpg`;
        
        if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
            try {
                const urlWithoutParams = imageData.split('?')[0];
                const urlParts = urlWithoutParams.split('/');
                const originalName = urlParts[urlParts.length - 1];
                if (originalName && originalName.includes('.')) {
                    fileName = `${chapterId}_${originalName}`;
                }
            } catch(e) {}
            
            // It's a URL - download the file directly
            const filePath = `${imagesDir}${fileName}`;
            const downloadOptions = {
                headers: {
                    'Referer': imageData.includes('boylove') ? 'https://boylove.cc/' : 'https://18comic.vip/',
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
                }
            };
            if (cookieStr) {
                downloadOptions.headers['Cookie'] = cookieStr;
            }
            const result = await FileSystem.downloadAsync(imageData, filePath, downloadOptions);
            if (result.status !== 200) {
            throw new Error(`圖片下載失敗 (HTTP ${result.status}): ${imageData}`);
            }
            return result.uri;
        } else {
            const filePath = `${imagesDir}${fileName}`;
            // It's base64 data (possibly with data:image prefix)
            const cleanBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
            await FileSystem.writeAsStringAsync(filePath, cleanBase64, { encoding: FileSystem.EncodingType.Base64 });
            return filePath;
        }
    } catch (e) {

        throw e;
    }
};

export const saveComicChapterData = async (novelId, chapterIndex, title, pages, isScrambled = undefined) => {
    const folderPath = getNovelDir(novelId);
    try {
        const info = await FileSystem.getInfoAsync(folderPath);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
        }
        
        const fileId = typeof chapterIndex === 'number' ? chapterIndex.toString() : chapterIndex;
        const filePath = `${folderPath}${fileId}.json`;
        
        // pages is an array of local file URIs
        const data = { title, pages, id: fileId };
        if (isScrambled !== undefined) {
            data.isScrambled = isScrambled;
        }
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        // Invalidate storage usage cache once per chapter completion

        return fileId;
    } catch (e) {
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

export const replaceNovelChapters = async (novelId, newChaptersData, onProgress = null) => {
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
            if (i % 50 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
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

            if (onProgress && (i % 10 === 0 || i === newChaptersData.length - 1)) {
                onProgress(i + 1, newChaptersData.length);
            }
            if (i % 25 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
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

export const getAllChapterText = async (novelId, onProgress = null) => {
    return lockStorage(async () => {
        const fullNovel = await getNovelMetadata(novelId);
        if (!fullNovel) throw new Error('Novel not found');
        
        let fullText = '';
        for (let i = 0; i < fullNovel.chapters.length; i++) {
            const filePath = `${getNovelDir(novelId)}${i}.json`;
            try {
                const info = await FileSystem.getInfoAsync(filePath);
                if (info.exists) {
                    let content;
                    try {
                        const { File } = require('expo-file-system');
                        content = await new File(filePath).text();
                    } catch (e) {
                        content = await FileSystem.readAsStringAsync(filePath, { encoding: 'utf8' });
                    }
                    const parsed = JSON.parse(content);
                    
                    let titleToInject = parsed.title;
                    if (titleToInject.match(/\s*\(Part \d+\)$/)) {
                        if (titleToInject.match(/\s*\(Part [2-9]\d*\)$/)) {
                            titleToInject = ''; // Don't inject title for Part 2 and beyond
                        } else {
                            titleToInject = titleToInject.replace(/\s*\(Part 1\)$/, ''); // Only inject base title for Part 1
                        }
                    }
                    
                    // Add chapter title back into the text to ensure it can be re-split if it matches the regex
                    if (titleToInject) {
                        fullText += `\n\n${titleToInject}\n\n${parsed.text}`;
                    } else {
                        fullText += `\n\n${parsed.text}`;
                    }
                }
            } catch (e) {}

            if (onProgress && (i % 20 === 0 || i === fullNovel.chapters.length - 1)) {
                onProgress(i + 1, fullNovel.chapters.length);
            }
            if (i % 25 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
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

                }
            }
        }
        
        // Save the new chapters
        await ensureNovelDir(novelId);
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

export const addReadingTime = async (seconds) => {
    try {
        const statsStr = await AsyncStorage.getItem('@reading_stats');
        let stats = statsStr ? JSON.parse(statsStr) : { totalSeconds: 0 };
        stats.totalSeconds += seconds;
        await AsyncStorage.setItem('@reading_stats', JSON.stringify(stats));
    } catch(e) {}
};

export const getReadingStats = async () => {
    try {
        const statsStr = await AsyncStorage.getItem('@reading_stats');
        return statsStr ? JSON.parse(statsStr) : { totalSeconds: 0 };
    } catch(e) { return { totalSeconds: 0 }; }
};


