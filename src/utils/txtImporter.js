import * as FileSystem from 'expo-file-system/legacy';
import { convertS2T } from './opencc';
import { saveNovelToBookshelf, saveChapterText, ensureNovelDir } from './storage';

/**
 * Common chapter header patterns in Chinese & English web novels
 */
const DEFAULT_CHAPTER_PATTERNS = [
    // Standard: 第1章, 第一千二百三十四章, 第 1 節, 第1回, etc.
    /(?:^|\n)\s*(第\s*[0-9零一二三四五六七八九十百千兩]+\s*[章節卷回折篇集部話][^\n\r]*)/g,
    // Pure numbers: 1. 標題, 001、標題, 123 標題
    /(?:^|\n)\s*([0-9]{1,5}[、.．\s]+[^\n\r]+)/g,
    // English chapters: Chapter 1, CHAPTER 100
    /(?:^|\n)\s*(Chapter\s*[0-9]+[^\n\r]*)/gi,
];

/**
 * Finds chapter split points in text using custom regex, example, or auto-detection
 */
export function findChapterBoundaries(text, customRegexStr, splitMode, splitExampleStr) {
    let customRegex = null;

    if (splitMode === 'example' && splitExampleStr && splitExampleStr.trim()) {
        try {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const patternStr = '(?:^|\\n)\\s*(' + escapeRegExp(splitExampleStr.trim()).replace(/\d+/g, '\\d+') + '[^\\n]*)';
            customRegex = new RegExp(patternStr, 'g');
        } catch (e) {}
    } else if (splitMode === 'regex' && customRegexStr && customRegexStr.trim()) {
        try {
            let regexStr = customRegexStr.trim();
            // Wrap in line start if not present to avoid matching in middle of sentence
            if (!regexStr.startsWith('(?:^|\\n)') && !regexStr.startsWith('^')) {
                regexStr = '(?:^|\\n)\\s*(' + regexStr + ')';
            }
            customRegex = new RegExp(regexStr, 'g');
        } catch (e) {}
    }

    const testRegexes = customRegex ? [customRegex, ...DEFAULT_CHAPTER_PATTERNS] : DEFAULT_CHAPTER_PATTERNS;

    for (const regex of testRegexes) {
        regex.lastIndex = 0;
        const matches = [];
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            const rawTitle = match[1] || match[0];
            const title = rawTitle.trim();
            const index = match.index;
            const length = match[0].length;
            matches.push({ index, length, title });
            
            // Safety break for infinite loops with zero-width matches
            if (regex.lastIndex === index) {
                regex.lastIndex++;
            }
        }

        // If we found at least 3 chapters with this pattern, use it!
        if (matches.length >= 3) {
            return matches;
        }
    }

    return [];
}

/**
 * Ultra-fast, non-blocking TXT importer for large novels (3000+ chapters / 20MB+)
 * Performs asynchronous processing, chapter-by-chapter S2T conversion, batch I/O, and UI progress reporting.
 */
export async function importLargeTxtNovel({
    title,
    author = '自訂匯入',
    rawContent,
    customRegexStr,
    splitMode = 'regex',
    splitExampleStr = '',
    onProgress = () => {}
}) {
    if (!rawContent || !rawContent.trim()) {
        throw new Error('檔案內容為空');
    }

    onProgress({
        percent: 0,
        statusText: '正在掃描章節目錄結構...',
        current: 0,
        total: 0,
        currentTitle: ''
    });

    // Yield to allow UI modal to display immediately
    await new Promise(r => setTimeout(r, 50));

    const novelId = 'manual_' + Date.now();
    await ensureNovelDir(novelId);

    // Skip newline replacement for large strings to save memory
    const textData = rawContent;

    // Find chapter boundary markers
    const matches = findChapterBoundaries(textData, customRegexStr, splitMode, splitExampleStr);

    let parsedChapters = []; // Store only start/end indices

    if (matches.length >= 3) {
        // Section before first chapter = Preface/Introduction
        const firstMatch = matches[0];
        const introText = textData.substring(0, firstMatch.index).trim();
        if (introText.length > 20) {
            parsedChapters.push({
                title: '前言/簡介',
                start: 0,
                end: firstMatch.index
            });
        }

        for (let i = 0; i < matches.length; i++) {
            const currentMatch = matches[i];
            const nextMatch = i + 1 < matches.length ? matches[i + 1] : null;
            
            const startPos = currentMatch.index + currentMatch.length;
            const endPos = nextMatch ? nextMatch.index : textData.length;

            parsedChapters.push({
                title: currentMatch.title,
                start: startPos,
                end: endPos
            });
        }
    } else {
        // Fallback: Split by fixed length (~8,000 characters) on natural paragraph breaks
        onProgress({
            percent: 5,
            statusText: '未檢測到常規章節標題，依段落自動分段中...',
            current: 0,
            total: 0,
            currentTitle: ''
        });

        const TARGET_CHUNK_SIZE = 8000;
        let lastEnd = 0;
        let partIndex = 1;

        while (lastEnd < textData.length) {
            let chunkEnd = lastEnd + TARGET_CHUNK_SIZE;
            if (chunkEnd < textData.length) {
                // Find next newline after chunkEnd to not break a line in half
                let nextNewline = textData.indexOf('\n', chunkEnd);
                if (nextNewline !== -1) {
                    chunkEnd = nextNewline;
                } else {
                    chunkEnd = textData.length;
                }
            } else {
                chunkEnd = textData.length;
            }

            parsedChapters.push({
                title: `第 ${partIndex} 部分`,
                start: lastEnd,
                end: chunkEnd
            });
            partIndex++;
            lastEnd = chunkEnd + 1;
        }
    }

    const totalChapters = parsedChapters.length;
    if (totalChapters === 0) {
        throw new Error('無法切分小說章節，內容可能為空');
    }

    const chaptersMeta = [];
    const BATCH_SIZE = 25; // Process in small batches with async yields for 60fps UI
    const convertedTitle = convertS2T(title.trim());

    for (let i = 0; i < totalChapters; i++) {
        const item = parsedChapters[i];
        
        // Fast chapter-by-chapter S2T conversion
        const chTitle = convertS2T(item.title || `第 ${i + 1} 章`);
        const rawChunk = textData.substring(item.start, item.end).trim();
        const chText = convertS2T(rawChunk);

        chaptersMeta.push({
            id: i,
            url: `manual_${i}`,
            title: chTitle
        });

        // Save chapter file
        await saveChapterText(novelId, i, chTitle, chText);

        // Update progress & yield event loop
        if (i % BATCH_SIZE === 0 || i === totalChapters - 1) {
            const percent = Math.min(99, Math.round(((i + 1) / totalChapters) * 100));
            onProgress({
                percent,
                statusText: `正在寫入章節 (${i + 1} / ${totalChapters})`,
                current: i + 1,
                total: totalChapters,
                currentTitle: chTitle
            });
            // Micro-yield to maintain UI responsiveness
            await new Promise(r => setTimeout(r, 0));
        }
    }

    onProgress({
        percent: 100,
        statusText: '正在建立書籍索引...',
        current: totalChapters,
        total: totalChapters,
        currentTitle: '完成'
    });

    const novelInfo = {
        id: novelId,
        title: convertedTitle,
        author: convertS2T(author),
        cover: '',
        url: 'manual',
        chapters: chaptersMeta,
        chapterCount: chaptersMeta.length,
        downloadedChapters: chaptersMeta.length
    };

    await saveNovelToBookshelf(novelInfo);

    return {
        success: true,
        novelId,
        chapterCount: chaptersMeta.length,
        title: convertedTitle
    };
}
