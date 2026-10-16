import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { getNovelMetadata, getNovelDir } from './storage';

/**
 * Clean string for safe file name across iOS/Android/Windows
 */
const sanitizeFileName = (name) => {
    return (name || '未命名')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Extract full text of a downloaded novel
 * @param {string} novelId 
 * @param {function} onChapterProgress 
 * @returns {Promise<{ fileName: string, content: string, chapterCount: number, title: string } | null>}
 */
export const buildNovelTxt = async (novelId, onChapterProgress = null) => {
    const fullNovel = await getNovelMetadata(novelId);
    if (!fullNovel) return null;
    if (fullNovel.type === 'comic') return null; // Text novels only

    const folderPath = getNovelDir(novelId);
    const dirInfo = await FileSystem.getInfoAsync(folderPath);
    if (!dirInfo.exists) return null;

    // Check directory files
    const allFiles = await FileSystem.readDirectoryAsync(folderPath);
    const jsonFiles = allFiles.filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) return null;

    const title = fullNovel.title || '未命名小說';
    const author = fullNovel.author || '未知作者';
    const safeTitle = sanitizeFileName(title);
    const safeAuthor = sanitizeFileName(author);
    const fileName = `《${safeTitle}》 - ${safeAuthor}.txt`;

    // Determine order of chapters
    let chapterIndices = [];
    if (fullNovel.chapters && fullNovel.chapters.length > 0) {
        for (let i = 0; i < fullNovel.chapters.length; i++) {
            if (allFiles.includes(`${i}.json`)) {
                chapterIndices.push(i);
            }
        }
    } else {
        chapterIndices = jsonFiles
            .map(f => parseInt(f.replace('.json', ''), 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => a - b);
    }

    if (chapterIndices.length === 0) return null;

    let novelHeader = `《${title}》\n`;
    novelHeader += `作者：${author}\n`;
    if (fullNovel.url) {
        novelHeader += `來源：${fullNovel.url}\n`;
    }
    novelHeader += `已下載章數：共 ${chapterIndices.length} 章\n`;
    novelHeader += `========================================\n\n`;

    const chapterBlocks = [];
    const totalChapters = chapterIndices.length;

    for (let idx = 0; idx < totalChapters; idx++) {
        const chNum = chapterIndices[idx];
        const filePath = `${folderPath}${chNum}.json`;
        try {
            const jsonStr = await FileSystem.readAsStringAsync(filePath, { encoding: 'utf8' });
            const parsed = JSON.parse(jsonStr);

            let titleToInject = parsed.title || `第 ${chNum + 1} 章`;
            if (titleToInject.match(/\s*\(Part \d+\)$/)) {
                if (titleToInject.match(/\s*\(Part [2-9]\d*\)$/)) {
                    titleToInject = ''; // Part 2+ does not repeat title
                } else {
                    titleToInject = titleToInject.replace(/\s*\(Part 1\)$/, '');
                }
            }

            const body = (parsed.text || '').trim();
            if (titleToInject) {
                chapterBlocks.push(`${titleToInject}\n\n${body}`);
            } else {
                chapterBlocks.push(body);
            }
        } catch (e) {
            console.warn(`Failed to read chapter ${chNum} of ${novelId}:`, e);
        }

        if (onChapterProgress && (idx % 20 === 0 || idx === totalChapters - 1)) {
            onChapterProgress(idx + 1, totalChapters);
        }

        // Micro-yield to prevent UI lockup
        if (idx % 30 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    if (chapterBlocks.length === 0) return null;

    const fullContent = novelHeader + chapterBlocks.join('\n\n\n') + '\n';
    return {
        fileName,
        content: fullContent,
        chapterCount: chapterBlocks.length,
        title
    };
};

/**
 * Export selected novels
 * @param {Array<string>} novelIds
 * @param {function} onProgress callback (statusText, percent)
 * @returns {Promise<{ success: boolean, exportedCount: number, skippedCount: number, message?: string }>}
 */
export const exportNovels = async (novelIds, onProgress = null) => {
    if (!novelIds || novelIds.length === 0) {
        return { success: false, message: '未選取任何小說' };
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
        return { success: false, message: '您的裝置不支援分享/匯出功能。' };
    }

    const exportedNovels = [];
    const skippedNovels = [];
    const totalNovels = novelIds.length;

    let tempFilesToClean = [];

    try {
        for (let i = 0; i < totalNovels; i++) {
            const novelId = novelIds[i];
            if (onProgress) {
                const basePct = (i / totalNovels) * 0.7;
                onProgress(`正在讀取書籍 (${i + 1}/${totalNovels})...`, basePct);
            }

            const novelData = await buildNovelTxt(novelId, (curCh, totalCh) => {
                if (onProgress) {
                    const novelFraction = (i + (curCh / totalCh)) / totalNovels;
                    onProgress(`正在封裝章節: ${curCh}/${totalCh}...`, novelFraction * 0.7);
                }
            });

            if (novelData) {
                exportedNovels.push(novelData);
            } else {
                skippedNovels.push(novelId);
            }
        }

        if (exportedNovels.length === 0) {
            return {
                success: false,
                exportedCount: 0,
                skippedCount: skippedNovels.length,
                message: '選取的小說尚未下載任何章節（或均為非文字小說），無法匯出。'
            };
        }

        // Single novel export -> export as .txt directly
        if (exportedNovels.length === 1) {
            const novel = exportedNovels[0];
            if (onProgress) onProgress(`正在準備匯出《${novel.title}》...`, 0.85);

            const filePath = `${FileSystem.cacheDirectory}${novel.fileName}`;
            tempFilesToClean.push(filePath);

            await FileSystem.writeAsStringAsync(filePath, novel.content, { encoding: 'utf8' });

            if (onProgress) onProgress('完成！正在開啟分享...', 1.0);

            await Sharing.shareAsync(filePath, {
                mimeType: 'text/plain',
                dialogTitle: `匯出《${novel.title}》`,
                UTI: 'public.plain-text'
            });

            return {
                success: true,
                exportedCount: 1,
                skippedCount: skippedNovels.length
            };
        }

        // Multiple novels -> zip package
        if (onProgress) onProgress(`正在將 ${exportedNovels.length} 本小說壓縮打包...`, 0.8);

        const zip = new JSZip();
        // Avoid duplicate filenames in zip
        const usedNames = new Set();
        for (const item of exportedNovels) {
            let name = item.fileName;
            let counter = 1;
            while (usedNames.has(name)) {
                name = item.fileName.replace(/\.txt$/, ` (${counter}).txt`);
                counter++;
            }
            usedNames.add(name);
            zip.file(name, item.content);
        }

        if (onProgress) onProgress('正在產生壓縮檔...', 0.9);
        const zipBase64 = await zip.generateAsync({
            type: 'base64',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const zipFileName = `小說匯出_共${exportedNovels.length}本_${dateStr}.zip`;
        const zipPath = `${FileSystem.cacheDirectory}${zipFileName}`;
        tempFilesToClean.push(zipPath);

        await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 });

        if (onProgress) onProgress('完成！正在開啟分享...', 1.0);

        await Sharing.shareAsync(zipPath, {
            mimeType: 'application/zip',
            dialogTitle: `匯出 ${exportedNovels.length} 本小說`,
            UTI: 'public.zip-archive'
        });

        return {
            success: true,
            exportedCount: exportedNovels.length,
            skippedCount: skippedNovels.length
        };
    } finally {
        // Micro-delay before deleting temporary cache files
        setTimeout(async () => {
            for (const path of tempFilesToClean) {
                try {
                    await FileSystem.deleteAsync(path, { idempotent: true });
                } catch (e) {}
            }
        }, 30000); // 30 seconds allows iOS share sheet to finish copying/sending
    }
};
