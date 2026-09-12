const fs = require('fs');
let code = fs.readFileSync('src/utils/storage.js', 'utf8');

const target = `export const ensureNovelDir = async (novelId) => {
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
};`;

const replacement = `export const ensureNovelDir = async (novelId) => {
    const folderPath = getNovelDir(novelId);
    if (!verifiedNovelDirs.has(folderPath)) {
        const info = await FileSystem.getInfoAsync(folderPath);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
        }
        verifiedNovelDirs.add(folderPath);
    }
    return folderPath;
};`;

code = code.replace(target, replacement);

const targetSave = `        try {
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        } catch (e) {
            verifiedNovelDirs.delete(folderPath);
            folderPath = await ensureNovelDir(novelId);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        }`;
        
const replaceSave = `        try {
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: 'utf8' });
        } catch (e) {
            verifiedNovelDirs.delete(folderPath);
            folderPath = await ensureNovelDir(novelId);
            const newFilePath = \`\${folderPath}\${fileId}.json\`;
            await FileSystem.writeAsStringAsync(newFilePath, JSON.stringify(data), { encoding: 'utf8' });
        }`;

code = code.replace(targetSave, replaceSave);
fs.writeFileSync('src/utils/storage.js', code, 'utf8');
