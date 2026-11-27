import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Alert } from 'react-native';
import { saveNovelToBookshelf, saveChapterText, saveComicChapterData, ensureNovelDir, getNovelDir } from './storage';
import { convertS2T } from './opencc';

const CLOUD_CONFIG_KEY = '@cloud_sync_config';
export const DEFAULT_CLOUD_API_KEY = 'ns_k9m4x7p2v8q5r3w6';
export const DEFAULT_CLOUD_GAS_URL = '';

export const getCloudConfig = async () => {
    try {
        const str = await AsyncStorage.getItem(CLOUD_CONFIG_KEY);
        if (str) {
            const parsed = JSON.parse(str);
            return {
                gasUrl: (parsed.gasUrl || DEFAULT_CLOUD_GAS_URL || '').trim(),
                apiKey: (parsed.apiKey || DEFAULT_CLOUD_API_KEY).trim(),
            };
        }
    } catch (e) {}
    return {
        gasUrl: DEFAULT_CLOUD_GAS_URL,
        apiKey: DEFAULT_CLOUD_API_KEY,
    };
};

export const saveCloudConfig = async ({ gasUrl, apiKey }) => {
    const clean = {
        gasUrl: (gasUrl || '').trim(),
        apiKey: (apiKey || DEFAULT_CLOUD_API_KEY).trim(),
    };
    await AsyncStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(clean));
    return clean;
};

export const isCloudConfigured = async () => {
    const cfg = await getCloudConfig();
    return Boolean(cfg.gasUrl && cfg.gasUrl.startsWith('https://'));
};

const callGasGet = async (paramsObj) => {
    const cfg = await getCloudConfig();
    if (!cfg.gasUrl) {
        throw new Error('尚未設定 Google Apps Script 網址，請先到首頁右上角「設定」填入網址。');
    }
    const query = Object.entries({ ...paramsObj, key: cfg.apiKey })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
        .join('&');
    const sep = cfg.gasUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${cfg.gasUrl}${sep}${query}`, { method: 'GET' });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error('雲端伺服器回應格式錯誤（請確認 GAS 權限是否設為「所有人」）');
    }
    if (!json.ok) {
        throw new Error(json.error || '雲端 API 呼叫失敗');
    }
    return json;
};

const callGasPost = async (payload) => {
    const cfg = await getCloudConfig();
    if (!cfg.gasUrl) {
        throw new Error('尚未設定 Google Apps Script 網址，請先到首頁右上角「設定」填入網址。');
    }
    const res = await fetch(cfg.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, key: cfg.apiKey }),
    });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error('雲端伺服器回應格式錯誤（請確認 GAS 部署網址與權限）');
    }
    if (!json.ok) {
        throw new Error(json.error || '雲端 API 呼叫失敗');
    }
    return json;
};

export const pingCloudServer = async () => {
    return callGasGet({ action: 'ping' });
};

export const submitCloudTask = async ({ url, kind = 'auto', title = '', meta = {} }) => {
    return callGasPost({
        action: 'create',
        url,
        kind,
        title: title || url,
        meta,
    });
};

export const listCloudTasks = async () => {
    const res = await callGasGet({ action: 'list' });
    return res.tasks || [];
};

export const cancelCloudTask = async (id) => {
    return callGasPost({ action: 'cancel', id });
};

export const deleteCloudTask = async (id) => {
    return callGasPost({ action: 'delete', id });
};

/**
 * Dual-mode download prompt: if Cloud Sync is configured, offers choice between
 * local mobile download and PC Scrapling cloud download.
 */
export const promptDownloadMode = async ({ title = '此項目', onLocal, onCloud }) => {
    const configured = await isCloudConfigured();
    if (!configured) {
        onLocal();
        return;
    }

    Alert.alert(
        '選擇下載方式',
        `《${title}》要使用哪種方式爬取？`,
        [
            { text: '取消', style: 'cancel' },
            { text: '📱 手機直接下載', onPress: onLocal },
            { text: '🖥️ 雲端電腦 (Scrapling)', onPress: onCloud },
        ]
    );
};

const isZipBase64OrValid = async (fileUri) => {
    try {
        const info = await FileSystem.getInfoAsync(fileUri, { size: true });
        if (!info.exists || (info.size || 0) < 22) return false;
        const head = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
            length: 4,
            position: 0,
        });
        // ZIP signature PK\x03\x04 starts with "UEsD" or "UEsF" in base64
        return head.startsWith('UEs');
    } catch (e) {
        return false;
    }
};

/**
 * Downloads finished cloud zip chunks from Google Drive (with GAS base64 fallback),
 * extracts meta.json + chapter JSONs + descrambled images into novels/{id}/,
 * and saves the book into bookshelf or Vault.
 */
export const downloadAndImportCloudTask = async (task, onProgress = () => {}, targetFolderId = null) => {
    const files = Array.isArray(task.files) ? task.files : [];
    if (files.length === 0) {
        throw new Error('找不到雲端輸出檔案');
    }

    const tempPaths = [];
    let importedMeta = null;
    let novelId = null;

    try {
        for (let fIdx = 0; fIdx < files.length; fIdx++) {
            const f = files[fIdx];
            const tempZipPath = `${FileSystem.cacheDirectory}cloud_import_${task.id}_${fIdx}.zip`;
            tempPaths.push(tempZipPath);

            onProgress(`正在下載成品分包 (${fIdx + 1}/${files.length})...`, (fIdx / files.length) * 0.5);

            let gotValidZip = false;
            if (f.url) {
                try {
                    const dl = await FileSystem.downloadAsync(f.url, tempZipPath);
                    if (dl && dl.status === 200 && (await isZipBase64OrValid(tempZipPath))) {
                        gotValidZip = true;
                    }
                } catch (e) {}
            }

            if (!gotValidZip && f.fileId) {
                onProgress(`改用安全通道下載分包 (${fIdx + 1}/${files.length})...`, (fIdx / files.length) * 0.5 + 0.1);
                const res = await callGasGet({ action: 'download_b64', fileId: f.fileId });
                if (res && res.base64) {
                    await FileSystem.writeAsStringAsync(tempZipPath, res.base64, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    gotValidZip = true;
                }
            }

            if (!gotValidZip) {
                throw new Error(`無法下載雲端分包 ${f.name || fIdx + 1}`);
            }

            onProgress(`正在解壓縮並寫入本機 (${fIdx + 1}/${files.length})...`, (fIdx / files.length) * 0.5 + 0.35);
            const zipBase64 = await FileSystem.readAsStringAsync(tempZipPath, {
                encoding: FileSystem.EncodingType.Base64,
            });
            const zip = await JSZip.loadAsync(zipBase64, { base64: true });

            if (zip.file('meta.json')) {
                const metaStr = await zip.file('meta.json').async('string');
                importedMeta = JSON.parse(metaStr);
                novelId = importedMeta.id;
                await ensureNovelDir(novelId);
                if (importedMeta.type === 'comic') {
                    const imgDir = `${getNovelDir(novelId)}images/`;
                    const dirInfo = await FileSystem.getInfoAsync(imgDir);
                    if (!dirInfo.exists) {
                        await FileSystem.makeDirectoryAsync(imgDir, { intermediates: true });
                    }
                }
            }

            if (!novelId) {
                throw new Error('壓縮檔缺少 meta.json');
            }

            const novelDir = getNovelDir(novelId);
            const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir && name !== 'meta.json');

            for (let eIdx = 0; eIdx < entries.length; eIdx++) {
                const entryName = entries[eIdx];
                const entry = zip.files[entryName];

                if (entryName.startsWith('images/')) {
                    const b64 = await entry.async('base64');
                    await FileSystem.writeAsStringAsync(`${novelDir}${entryName}`, b64, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                } else if (entryName.endsWith('.json')) {
                    const chapterIdxStr = entryName.replace('.json', '');
                    const rawJsonStr = await entry.async('string');
                    const parsed = JSON.parse(rawJsonStr);

                    if (importedMeta.type === 'comic') {
                        const localPages = (parsed.pages || []).map(p => {
                            const fileName = String(p).split('/').pop();
                            return `${novelDir}images/${fileName}`;
                        });
                        await saveComicChapterData(novelId, chapterIdxStr, convertS2T(parsed.title || ''), localPages, false);
                    } else {
                        await saveChapterText(
                            novelId,
                            chapterIdxStr,
                            convertS2T(parsed.title || ''),
                            convertS2T(parsed.text || '')
                        );
                    }
                }

                if (eIdx % 25 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }

        if (!importedMeta || !novelId) {
            throw new Error('匯入失敗：找不到書籍中繼資料');
        }

        const novelDir = getNovelDir(novelId);
        const diskFiles = await FileSystem.readDirectoryAsync(novelDir);
        const downloadedJsonCount = diskFiles.filter(f => /^\d+\.json$/.test(f)).length;

        const convertedChapters = (importedMeta.chapters || []).map(ch => ({
            ...ch,
            title: convertS2T(ch.title || ''),
        }));

        await saveNovelToBookshelf({
            id: novelId,
            url: importedMeta.url || task.url,
            title: convertS2T(importedMeta.title || task.title || '未命名書籍'),
            author: convertS2T(importedMeta.author || '未知作者'),
            cover: importedMeta.cover || '',
            type: importedMeta.type || 'novel',
            chapters: convertedChapters,
            chapterCount: convertedChapters.length || downloadedJsonCount,
            downloadedChapters: downloadedJsonCount,
            isDescrambled: true,
            folderId: targetFolderId,
            isHidden: targetFolderId === 'vault',
        });

        onProgress('匯入完成！', 1);
        return {
            novelId,
            title: convertS2T(importedMeta.title || task.title),
            type: importedMeta.type || 'novel',
            downloadedChapters: downloadedJsonCount,
        };
    } finally {
        for (const p of tempPaths) {
            try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch (e) {}
        }
    }
};
