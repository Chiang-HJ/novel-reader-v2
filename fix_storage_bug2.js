const fs = require('fs');
let lines = fs.readFileSync('src/utils/storage.js', 'utf8').split('\n');

for(let i=0; i<lines.length; i++) {
    if (lines[i].includes('await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: \'utf8\' });') && lines[i-1].includes('data = { title, text, id: fileId };')) {
        lines.splice(i, 1, 
            '        try {',
            '            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: \'utf8\' });',
            '        } catch (e) {',
            '            verifiedNovelDirs.delete(folderPath);',
            '            folderPath = await ensureNovelDir(novelId);',
            '            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data), { encoding: \'utf8\' });',
            '        }'
        );
    }
    if (lines[i].includes('const folderPath = await ensureNovelDir(novelId);') && lines[i-2].includes('saveChapterText = async')) {
        lines[i] = lines[i].replace('const folderPath', 'let folderPath');
    }
    if (lines[i].includes('const folderPath = `${FileSystem.documentDirectory}novels/${novelId}/`;') && lines[i+1].includes('const info = await FileSystem.getInfoAsync(folderPath);')) {
        lines.splice(i+1, 0, '                verifiedNovelDirs.delete(folderPath);');
    }
}

fs.writeFileSync('src/utils/storage.js', lines.join('\n'), 'utf8');
