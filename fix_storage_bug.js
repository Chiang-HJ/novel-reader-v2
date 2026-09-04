const fs = require('fs');
let code = fs.readFileSync('src/utils/storage.js', 'utf8');

// 1. Update saveChapterText to retry on write failure
const oldSaveChapter = `export const saveChapterText = async (novelId, chapterIndex, title, text) => {
    try {
        const folderPath = await ensureNovelDir(novelId);
        
        // We use chapterIndex for backward compatibility, but we should make sure it's safely written
        const fileId = typeof chapterIndex === 'number' ? chapterIndex.toString() : chapterIndex;
        const filePath = \`\${folderPath}\${fileId}.json\`;
        
        const data = { title, text, id: fileId };
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        // Invalidate storage usage cache (new file written to disk)

        return fileId;
    } catch (e) {
        throw e;
    }
};`;

const newSaveChapter = `export const saveChapterText = async (novelId, chapterIndex, title, text) => {
    try {
        let folderPath = await ensureNovelDir(novelId);
        
        // We use chapterIndex for backward compatibility, but we should make sure it's safely written
        const fileId = typeof chapterIndex === 'number' ? chapterIndex.toString() : chapterIndex;
        const filePath = \`\${folderPath}\${fileId}.json\`;
        
        const data = { title, text, id: fileId };
        try {
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        } catch (e) {
            verifiedNovelDirs.delete(folderPath);
            folderPath = await ensureNovelDir(novelId);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        }
        
        return fileId;
    } catch (e) {
        throw e;
    }
};`;

code = code.replace(oldSaveChapter, newSaveChapter);

// 2. Update batchDeleteNovels to remove from verifiedNovelDirs
const oldBatchDelete = `        for (const novelId of novelIds) {
            try {
                const folderPath = \`\${FileSystem.documentDirectory}novels/\${novelId}/\`;
                const info = await FileSystem.getInfoAsync(folderPath);
                if (info.exists) {
                    await FileSystem.deleteAsync(folderPath, { idempotent: true });
                }
            } catch (e) {}
        }`;
        
const newBatchDelete = `        for (const novelId of novelIds) {
            try {
                const folderPath = \`\${FileSystem.documentDirectory}novels/\${novelId}/\`;
                verifiedNovelDirs.delete(folderPath);
                const info = await FileSystem.getInfoAsync(folderPath);
                if (info.exists) {
                    await FileSystem.deleteAsync(folderPath, { idempotent: true });
                }
            } catch (e) {}
        }`;

code = code.replace(oldBatchDelete, newBatchDelete);

fs.writeFileSync('src/utils/storage.js', code, 'utf8');
